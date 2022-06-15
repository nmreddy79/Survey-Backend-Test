const express = require("express");
const mysql = require("mysql2");
const AWS = require("aws-sdk");
const mailer = require("./mailer");
const trelloMail = require("./trello");
const capacityMailer = require("./capacityMailer");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_TEST);
const bodyParser = require("body-parser");
const CognitoExpress = require("cognito-express");
const { CronJob } = require("cron");
const passwordHash = require("password-hash");

// AWS SES Access to send singe and bulk emails
AWS.config.update({
  region: "us-east-1",
  credentials: {
    accessKeyId: "AKIAWNMLKSYHQXNBD5NI",
    secretAccessKey: "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",
  },
});

// AWS Cognito APIS
const cognitoExpress = new CognitoExpress({
  region: "us-east-1",
  cognitoUserPoolId: "us-east-1_ETQdANc8H",
  tokenUse: "access", //Possible Values: access | id
  tokenExpiration: 3600000, //Up to default expiration of 1 hour (3600000 ms)
});

// AWS ML Apis
const comprehend = new AWS.Comprehend({
  apiVersion: "2017-11-27",
  region: "us-east-1",
});

// Database connections
const con = mysql.createConnection({
  host: "happyagility.cf2p9vqamaaf.us-east-1.rds.amazonaws.com",
  user: "admin",
  password: "Survey2021",
  database: "happyagility",
});

const cors = require("cors");
var timeout = require("connect-timeout");
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(
  "508371789117-lj9bkmn1cf13rl190k79adcsk6ctl8b5.apps.googleusercontent.com"
);
const allowedOrigins = [
  "http://localhost:3000",
  "https://landing.happyagility.com",
  "https://app.happyagility.com",
];
const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
};
var axios = require("axios");
const transporter = require("./config");
const request = require("request");
const PORT = process.env.PORT || 8080;

const app = express();
app.use(express.static("."));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors(corsOptions));
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});

async function authorizeUser(req, res, next) {
  if (req.query.login_used === "Cognito") {
    try {
      const response = await cognitoExpress.validate(req.headers.authorization);
      console.log("Authenticated");
      next();
    } catch (e) {
      res.send({ status: 401 });
    }
  } else {
    const result = await client
      .verifyIdToken({
        idToken: req.headers.authorization,
        audience:
          "508371789117-lj9bkmn1cf13rl190k79adcsk6ctl8b5.apps.googleusercontent.com",
      })
      .then(() => {
        next();
      })
      .catch(() => {
        res.send({
          status: 401,
        });
      });
  }
}

// Routes that don't require authentication

// Password verification
app.get("/check_password", (req, res) => {
  if (req.query.entered_password && req.query.survey_password) {
    res.send(
      passwordHash.verify(req.query.entered_password, req.query.survey_password)
    );
  }
});

// Adding user on registering
app.post("/add_user", (req, res) => {
  if (req.query.username && req.query.email) {
    const datetime = new Date().toISOString().slice(0, 19).replace("T", " ");
    console.log("Request received");
    con.connect(function (err) {
      con.query(
        `INSERT INTO happyagility.accounts (account_id, username, user_email,account_type,emails_allowed,emails_used,responses_allowed,responses_got,survey_allowed,survey_used,subscription_type,date_time,industry) VALUES ('${
          req.query.user_id
        }','${req.query.username}', '${
          req.query.email
        }', '${"free"}', ${1000}, ${0}, ${250}, ${0}, ${5}, ${0}, "free",'${datetime}','${
          req.query.industry
        }')`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("Missing a parameter");
  }
});

// Authorizing user
app.get("/authorize_this_user", (req, res) => {
  async function letsAuth() {
    const result = await authorizeUser(
      req.query.login_used,
      req.headers.authorization
    );
    if (result === "Authorized C" || result === "Authorized G") {
      setTimeout(function () {
        res.send({ status: 200 });
      }, 2000);
    } else {
      setTimeout(function () {
        res.send({ status: 401 });
      }, 2000);
    }
  }
  letsAuth();
});

// Getting all ips on survey taking page
app.get("/ip_address_used", (req, res) => {
  console.log("Ip address used or not request received");
  con.connect(function (err) {
    con.query(
      `Select * from happyagility.answers where survey_id='${req.query.database_unique_survey_id}' and ip_address='${req.query.ip}'`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  });
});

// Push answers coming in
app.post("/answer_data", (req, res) => {
  console.log("Survey Answer Submission Request received", req.body);
  con.connect(function (err) {
    const answer_datetime = new Date()
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
    var values = [
      [
        req.body.answer_type,
        req.body.questionText,
        req.body.answer,
        req.body.source,
        req.body.option1,
        req.body.option2,
        req.body.option3,
        req.body.option4,
        req.body.option5,
        req.body.answer1,
        req.body.answer2,
        req.body.answer3,
        req.body.answer4,
        req.body.answer5,
        req.body.database_unique_survey_id,
        req.body.database_question_id,
        req.body.user_id,
        answer_datetime,
        req.body.time_taken,
        req.body.ip_address,
        req.body.city,
        req.body.country,
        req.body.region_name,
        req.body.questionTextConv,
        req.body.address,
        req.body.verified_by,
        req.body.label,
        req.body.questionLink,
        req.body.filter1,
        req.body.filter2,
        req.body.filter3,
        req.body.filter4,
        req.body.filter5,
        req.body.start_time,
        req.body.end_time,
      ],
    ];
    con.query(
      `INSERT INTO happyagility.answers (answer_type, questionText, answer, source, option1,option2,option3,option4,option5,answer1,answer2,answer3,answer4,answer5,survey_id,question_id,user_id,answer_datetime,time_taken,ip_address,city,country,state, questionTextConv, address, verified_by, label, questionLink, filter1, filter2, filter3, filter4, filter5, start_time, end_time) VALUES ?`,
      [values],
      function (err, result) {
        if (err) {
          res.send(err);
        }
        if (result) res.send(result);
      }
    );
  });
});

app.post("/follow_up_data", (req, res) => {
  console.log("Request received", req.body);
  con.connect(function (err) {
    const answer_datetime = new Date()
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
    var values = [
      [
        req.body.answer_type,
        req.body.questionText,
        req.body.answer,
        req.body.source,
        req.body.database_unique_survey_id,
        req.body.database_question_id,
        req.body.user_id,
        answer_datetime,
        req.body.time_taken,
        req.body.ip_address,
        req.body.city,
        req.body.country,
        req.body.region_name,
        req.body.address,
        req.body.verified_by,
      ],
    ];
    con.query(
      `INSERT INTO happyagility.answers (answer_type, questionText, answer, source ,survey_id, question_id,user_id,answer_datetime,time_taken,ip_address,city,country,state, address, verified_by) VALUES ?`,
      [values],
      function (err, result0, fields) {
        if (err) {
          console.log(err);
          res.send(err);
        }
        if (result0) {
          con.query(
            `SELECT * FROM happyagility.accounts WHERE account_id='${req.body.account_id}'`,
            function (err, result) {
              if (err) {
                res.send(err);
              }
              if (result) {
                if (
                  result[0].responses_got + 1 <=
                  result[0].responses_allowed
                ) {
                  con.query(
                    `UPDATE happyagility.accounts SET responses_got="${
                      result[0].responses_got + 1
                    }" where account_id="${req.query.account_id}"`,
                    function (err1, result1) {
                      if (err1) res.send(err1);
                      if (result1) res.send(result1);
                    }
                  );
                }
              }
            }
          );
        }
        if (fields) console.log(fields);
      }
    );
  });
});

// On response send mail to the user who created the survey
app.post("/response_update_mail", (req, res, next) => {
  var mail_list = [];
  mail_list.push(req.query.user_email);
  return mailer
    .sendMail("support@happyagility.com", mail_list, req.query)
    .then(() => {
      res.send(req.query);
    })
    .catch(next);
});

// Check if this google user exists
app.get("/check_if_user_exists", (req, res) => {
  if (req.query.email) {
    console.log("Google user id is present or not");
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.accounts WHERE user_email = "${req.query.email}";`,
        function (err, result) {
          if (err) {
            console.log(err);
            res.send(err);
          }
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User id not present");
  }
});

/////////////////////

///////////////////////

// app.get("/employees", (req, res) => {
//   con.query(`SELECT * FROM happyagility.Testing`, function (err, result) {
//     if (err) res.send(err);
//     if (result) res.send(result);
//   });
// });
// app.post("/employees/create", (req, res) => {
//   console.log(req.body);
//   con.query(
//     `INSERT INTO happyagility.Testing (name, age) VALUES ('${req.body.name}', ${req.body.age})`,
//     function (err, result) {
//       if (err) res.send(err);
//       if (result) res.send(result);
//     }
//   );
// });
// app.put("/employees/update", (req, res) => {
//   con.query(
//     `UPDATE happyagility.Testing SET name='${req.body.name}', age=${req.body.age} where testing_id=${req.query.id}`,
//     function (err, result) {
//       if (err) res.send(err);
//       if (result) res.send(result);
//     }
//   );
// });
// app.delete("/employees/delete", (req, res) => {
//   con.query(
//     `DELETE from happyagility.Testing where testing_id="${req.query.id}"`,
//     function (err, result) {
//       if (err) res.send(err);
//       if (result) res.send(result);
//     }
//   );
// });

// Routes that require authentication
// app.all("*", authorizeUser(req.query.loginUsed, req.query.accessToken));
// Get Cluster Keywords
app.get("/get_cluster_keywords", (req, res) => {
  console.log("Cluster Keywords details request received");
  if (req.query.survey_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.cluster_keywords where survey_id='${req.query.survey_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("Survey Id Not Present !!!");
  }
});

//Get the user_trustpilot_id
app.get("/get_usertpid", (req, res) => {
  console.log("Usertrustpilot id request received");
  if (req.query.user_id) {
    con.connect(function (err) {
      con.query(
        `SELECT user_trustpilot_id FROM happyagility.trustpilotSc where user_id='${req.query.user_id}' LIMIT 1`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) {
            res.send(result);
          }
        }
      );
    });
  } else {
    console.log("No user id present");
  }
});

//Get the user_gpsc_id
app.get("/get_userpsid", (req, res) => {
  console.log("User playstore id request received");
  if (req.query.user_id) {
    con.connect(function (err) {
      con.query(
        `SELECT user_gpsc_id FROM happyagility.googlePlaystoreSc where user_id='${req.query.user_id}' LIMIT 1`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) {
            res.send(result);
          }
        }
      );
    });
  } else {
    console.log("No user id present");
  }
});

//Get the user_zen_id
app.get("/get_userzdid", (req, res) => {
  console.log("User zendesk id request received");
  if (req.query.user_id) {
    con.connect(function (err) {
      con.query(
        `SELECT user_zen_id FROM happyagility.zendeskSc where user_id='${req.query.user_id}' LIMIT 1`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) {
            res.send(result);
          }
        }
      );
    });
  } else {
    console.log("No user id present");
  }
});

//Get the user_fresh_id
app.get("/get_userfdid", (req, res) => {
  console.log("User freshdesk id request received");
  if (req.query.user_id) {
    con.connect(function (err) {
      con.query(
        `SELECT user_fresh_id FROM happyagility.freshSc where user_id='${req.query.user_id}' LIMIT 1`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) {
            res.send(result);
          }
        }
      );
    });
  } else {
    console.log("No user id present");
  }
});

//Get the user_hub_id
app.get("/get_userhsid", (req, res) => {
  console.log("User hubspot id request received");
  if (req.query.user_id) {
    con.connect(function (err) {
      con.query(
        `SELECT user_hub_id FROM happyagility.hubSc where user_id='${req.query.user_id}' LIMIT 1`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) {
            res.send(result);
          }
        }
      );
    });
  } else {
    console.log("No user id present");
  }
});

//Get the user_ytsc_id
app.get("/get_userytid", (req, res) => {
  console.log("User youtube id request received");
  if (req.query.user_id) {
    con.connect(function (err) {
      con.query(
        `SELECT user_ytsc_id FROM happyagility.youtubeSc where user_id='${req.query.user_id}' LIMIT 1`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) {
            res.send(result);
          }
        }
      );
    });
  } else {
    console.log("No user id present");
  }
});

//Get the user_ytsc_id - website for youtube ts
app.get("/get_useryt_ts_id", (req, res) => {
  console.log("User youtube ts id request received");
  if (req.query.user_id) {
    con.connect(function (err) {
      con.query(
        `SELECT website FROM happyagility.youtubeTsRequest where user_id='${req.query.user_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) {
            res.send(result);
          }
        }
      );
    });
  } else {
    console.log("No user id present");
  }
});

//Get the user_azsc_id - website for amazon
app.get("/get_useraz_id", (req, res) => {
  console.log("User amazon id request received");
  if (req.query.user_id) {
    con.connect(function (err) {
      con.query(
        `SELECT website FROM happyagility.amazonRequest where user_id='${req.query.user_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) {
            res.send(result);
          }
        }
      );
    });
  } else {
    console.log("No user id present");
  }
});

// Get Trustpilot Cluster Keywords
app.get("/get_trustpilot_cluster_keywords", (req, res) => {
  console.log("Trustpilot Cluster Keywords details request received");

  if (req.query.user_trustpilot_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.trustpilot_cluster_keywords where user_trustpilot_id='${req.query.user_trustpilot_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User Id Not Present !!!");
  }
});

// Get Playstore Cluster Keywords
app.get("/get_playstore_cluster_keywords", (req, res) => {
  console.log("Playstore Cluster Keywords details request received");

  if (req.query.user_gpsc_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.gp_cluster_keywords where user_gpsc_id='${req.query.user_gpsc_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User Id Not Present !!!");
  }
});

// Get Zendesk Cluster Keywords
app.get("/get_zendesk_cluster_keywords", (req, res) => {
  console.log("Zendesk Cluster Keywords details request received");

  if (req.query.user_zen_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.zendesk_cluster where user_zen_id='${req.query.user_zen_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User Id Not Present !!!");
  }
});

// Get Freshdesk Cluster Keywords
app.get("/get_freshdesk_cluster_keywords", (req, res) => {
  console.log("Freshdesk Cluster Keywords details request received");

  if (req.query.user_fresh_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.fresh_cluster where user_fresh_id='${req.query.user_fresh_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User Id Not Present !!!");
  }
});

// Get Hubspot Cluster Keywords
app.get("/get_hubspot_cluster_keywords", (req, res) => {
  console.log("Hubspot Cluster Keywords details request received");

  if (req.query.user_hub_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.hub_cluster where user_hub_id='${req.query.user_hub_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User Id Not Present !!!");
  }
});

// Get Youtube Cluster Keywords
app.get("/get_youtube_cluster_keywords", (req, res) => {
  console.log("Youtube Cluster Keywords details request received");

  if (req.query.user_ytsc_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.yt_cluster_keywords where user_ytsc_id='${req.query.user_ytsc_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User Id Not Present !!!");
  }
});

// Get Youtube Cluster Keywords
app.get("/get_youtube_ts_cluster_keywords", (req, res) => {
  console.log("Youtube TS Cluster Keywords details request received");

  if (req.query.user_ytsc_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.yt_ts_cluster_keywords where user_ytsc_id='${req.query.user_ytsc_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User Id Not Present !!!");
  }
});

// Get Amazon Cluster Keywords
app.get("/get_amazon_cluster_keywords", (req, res) => {
  console.log("Amazon Cluster Keywords details request received");

  if (req.query.user_azsc_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.az_cluster_keywords where user_azsc_id='${req.query.user_azsc_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User Id Not Present !!!");
  }
});

// Get Neutral Survey Answers From Keywords
// Search keywords in answers
app.get("/search_neutral_keyword", (req, res) => {
  console.log("Neutral keyword search request received");
  if (req.query.survey_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.answers where survey_id='${req.query.survey_id}' and answer like '%${req.query.word}%' and sentiment='NEUTRAL'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("Survey Id or Word Not Present !!!");
  }
});

// Search Neutral Trustpilot keywords
app.get("/search_trustpilot_neutral_keyword", (req, res) => {
  console.log("Trustpilot Neutral keyword search request received");
  if (req.query.user_trustpilot_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.trustpilotSc where user_trustpilot_id='${req.query.user_trustpilot_id}' and Body like '%${req.query.word}%' and sentiments='NEUTRAL'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_trustpilot_id Id or Word Not Present !!!");
  }
});

// Search Neutral Playstore keywords
app.get("/search_playstore_neutral_keyword", (req, res) => {
  console.log("Playstore Neutral keyword search request received");
  if (req.query.user_gpsc_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.googlePlaystoreSc where user_gpsc_id='${req.query.user_gpsc_id}' and Body like '%${req.query.word}%' and sentiments='NEUTRAL'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_gpsc_id Id or Word Not Present !!!");
  }
});
// Search Neutral Zendesk keywords
app.get("/search_zendesk_neutral_keyword", (req, res) => {
  console.log("Zendesk Neutral keyword search request received");
  if (req.query.user_zen_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.zendeskSc where user_zen_id='${req.query.user_zen_id}' and Body like '%${req.query.word}%' and sentiments='NEUTRAL'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_zen_id Id or Word Not Present !!!");
  }
});

// Search Neutral Freshdesk keywords
app.get("/search_freshdesk_neutral_keyword", (req, res) => {
  console.log("Freshdesk Neutral keyword search request received");
  if (req.query.user_fresh_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.freshSc where user_fresh_id='${req.query.user_fresh_id}' and Body like '%${req.query.word}%' and sentiments='NEUTRAL'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_fresh_id Id or Word Not Present !!!");
  }
});

// Search Neutral Hubspot keywords
app.get("/search_hubspot_neutral_keyword", (req, res) => {
  console.log("Hubspot Neutral keyword search request received");
  if (req.query.user_hub_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.hubSc where user_hub_id='${req.query.user_hub_id}' and Body like '%${req.query.word}%' and sentiments='NEUTRAL'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_hub_id Id or Word Not Present !!!");
  }
});

// Search Neutral Youtube keywords
app.get("/search_youtube_neutral_keyword", (req, res) => {
  console.log("Youtube Neutral keyword search request received");
  if (req.query.user_ytsc_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.youtubeSc where user_ytsc_id='${req.query.user_ytsc_id}' and Body like '%${req.query.word}%' and sentiments='NEUTRAL'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_ytsc_id Id or Word Not Present !!!");
  }
});

// Search Neutral Youtube TS keywords
app.get("/search_youtube_ts_neutral_keyword", (req, res) => {
  console.log("Youtube Ts Neutral keyword search request received");
  if (req.query.user_ytsc_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.youtubeTranscriptSc where user_ytsc_id='${req.query.user_ytsc_id}' and Body like '%${req.query.word}%' and sentiments='NEUTRAL'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_ytsc_id Id or Word Not Present !!!");
  }
});

// Search Neutral Amazon keywords
app.get("/search_amazon_neutral_keyword", (req, res) => {
  console.log("Amazon Neutral keyword search request received");
  if (req.query.user_azsc_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.amazonReviewsSc where user_azsc_id='${req.query.user_azsc_id}' and Body like '%${req.query.word}%' and sentiments='NEUTRAL'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_azsc_id Id or Word Not Present !!!");
  }
});

// Get Positive Survey Answers From Keywords
// Search keywords in answers
app.get("/search_positive_keyword", (req, res) => {
  console.log("Positive keyword search request received");
  if (req.query.survey_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.answers where survey_id='${req.query.survey_id}' and answer like '%${req.query.word}%' and sentiment='POSITIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("Survey Id or Word Not Present !!!");
  }
});

// Search Positive Trustpilot keywords
app.get("/search_trustpilot_positive_keyword", (req, res) => {
  console.log("Trustpilot Positive keyword search request received");
  console.log(req.query);
  if (req.query.user_trustpilot_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.trustpilotSc where user_trustpilot_id='${req.query.user_trustpilot_id}' and Body like '%${req.query.word}%' and sentiments='POSITIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_trustpilot_id Id or Word Not Present !!!");
  }
});

// Search Positive Playstore keywords
app.get("/search_playstore_positive_keyword", (req, res) => {
  console.log("Playstore Positive keyword search request received");
  if (req.query.user_gpsc_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.googlePlaystoreSc where user_gpsc_id='${req.query.user_gpsc_id}' and Body like '%${req.query.word}%' and sentiments='POSITIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_gpsc_id Id or Word Not Present !!!");
  }
});

// Search Positive Zendesk keywords
app.get("/search_zendesk_positive_keyword", (req, res) => {
  console.log("Zendesk Positive keyword search request received");
  if (req.query.user_zen_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.zendeskSc where user_zen_id='${req.query.user_zen_id}' and Body like '%${req.query.word}%' and sentiments='POSITIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_zen_id Id or Word Not Present !!!");
  }
});

// Search Positive Freshdesk keywords
app.get("/search_freshdesk_positive_keyword", (req, res) => {
  console.log("Freshdesk Positive keyword search request received");
  if (req.query.user_fresh_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.freshSc where user_fresh_id='${req.query.user_fresh_id}' and Body like '%${req.query.word}%' and sentiments='POSITIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_fresh_id Id or Word Not Present !!!");
  }
});

// Search Positive Hubspot keywords
app.get("/search_hubspot_positive_keyword", (req, res) => {
  console.log("Hubspot Positive keyword search request received");
  if (req.query.user_hub_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.hubSc where user_hub_id='${req.query.user_hub_id}' and Body like '%${req.query.word}%' and sentiments='POSITIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_hub_id Id or Word Not Present !!!");
  }
});

// Search Positive Youtube keywords
app.get("/search_youtube_positive_keyword", (req, res) => {
  console.log("Youtube Positive keyword search request received");
  if (req.query.user_ytsc_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.youtubeSc where user_ytsc_id='${req.query.user_ytsc_id}' and Body like '%${req.query.word}%' and sentiments='POSITIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_ytsc_id Id or Word Not Present !!!");
  }
});

// Search Positive Youtube TS keywords
app.get("/search_youtube_ts_positive_keyword", (req, res) => {
  console.log("Youtube Ts Positive keyword search request received");
  if (req.query.user_ytsc_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.youtubeTranscriptSc where user_ytsc_id='${req.query.user_ytsc_id}' and Body like '%${req.query.word}%' and sentiments='POSITIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_ytsc_id Id or Word Not Present !!!");
  }
});

// Search Positive Amazon keywords
app.get("/search_amazon_positive_keyword", (req, res) => {
  console.log("Amazon Positive keyword search request received");
  if (req.query.user_azsc_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.amazonReviewsSc where user_azsc_id='${req.query.user_azsc_id}' and Body like '%${req.query.word}%' and sentiments='POSITIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_azsc_id Id or Word Not Present !!!");
  }
});

// Get Negative Survey Answers From Keywords
// Search keywords in answers
app.get("/search_negative_keyword", (req, res) => {
  console.log("Negative keyword search request received");
  if (req.query.survey_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.answers where survey_id='${req.query.survey_id}' and answer like '%${req.query.word}%' and sentiment='NEGATIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("Survey Id or Word Not Present !!!");
  }
});

// Search NEgative Trustpilot keywords
app.get("/search_trustpilot_negative_keyword", (req, res) => {
  console.log("Trustpilot Negative keyword search request received");
  if (req.query.user_trustpilot_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.trustpilotSc where user_trustpilot_id='${req.query.user_trustpilot_id}' and Body like '%${req.query.word}%' and sentiments='NEGATIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_trustpilot_id Id or Word Not Present !!!");
  }
});

// Search Negative Playstore keywords
app.get("/search_playstore_negative_keyword", (req, res) => {
  console.log("Playstore Negative keyword search request received");
  if (req.query.user_gpsc_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.googlePlaystoreSc where user_gpsc_id='${req.query.user_gpsc_id}' and Body like '%${req.query.word}%' and sentiments='NEGATIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_gpsc_id Id or Word Not Present !!!");
  }
});

// Search Negative Zendesk keywords
app.get("/search_zendesk_negative_keyword", (req, res) => {
  console.log("Zendesk Negative keyword search request received");
  if (req.query.user_zen_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.zendeskSc where user_zen_id='${req.query.user_zen_id}' and Body like '%${req.query.word}%' and sentiments='NEGATIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_zen_id Id or Word Not Present !!!");
  }
});

// Search Negative Freshdesk keywords
app.get("/search_freshdesk_negative_keyword", (req, res) => {
  console.log("Freshdesk Negative keyword search request received");
  if (req.query.user_fresh_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.freshSc where user_fresh_id='${req.query.user_fresh_id}' and Body like '%${req.query.word}%' and sentiments='NEGATIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_fresh_id Id or Word Not Present !!!");
  }
});

// Search Negative Hubspot keywords
app.get("/search_hubspot_negative_keyword", (req, res) => {
  console.log("Hubspot Negative keyword search request received");
  if (req.query.user_hub_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.hubSc where user_hub_id='${req.query.user_hub_id}' and Body like '%${req.query.word}%' and sentiments='NEGATIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_hub_id Id or Word Not Present !!!");
  }
});

// Search Negative Youtube keywords
app.get("/search_youtube_negative_keyword", (req, res) => {
  console.log("Youtube Negative keyword search request received");
  if (req.query.user_ytsc_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.youtubeSc where user_ytsc_id='${req.query.user_ytsc_id}' and Body like '%${req.query.word}%' and sentiments='NEGATIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_ytsc_id Id or Word Not Present !!!");
  }
});

// Search Negative Youtube keywords
app.get("/search_youtube_ts_negative_keyword", (req, res) => {
  console.log("Youtube Ts Negative keyword search request received");
  if (req.query.user_ytsc_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.youtubeTranscriptSc where user_ytsc_id='${req.query.user_ytsc_id}' and Body like '%${req.query.word}%' and sentiments='NEGATIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_ytsc_id Id or Word Not Present !!!");
  }
});

// Search Negative Amazon keywords
app.get("/search_amazon_negative_keyword", (req, res) => {
  console.log("Amazon Negative keyword search request received");
  if (req.query.user_azsc_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.amazonReviewsSc where user_azsc_id='${req.query.user_azsc_id}' and Body like '%${req.query.word}%' and sentiments='NEGATIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_azsc_id Id or Word Not Present !!!");
  }
});

// Get Trustpilot Negative Statements
app.get("/get_trustpilot_negative_statements", (req, res) => {
  console.log("Trustpilot negative statements details request received");
  if (req.query.user_trustpilot_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.trustpilotStatements where user_trustpiot_id='${req.query.user_trustpilot_id}' and sentiment='Negative' LIMIT 10`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User trustpilot id Not Present !!!");
  }
});

// Get Playstore Negative Statements
app.get("/get_playstore_negative_statements", (req, res) => {
  console.log("Playstore negative statements details request received");
  if (req.query.user_gpsc_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.googlePlaystoreStatements where user_gpsc_id='${req.query.user_gpsc_id}' and sentiment='Negative' LIMIT 10`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User user_gpsc_id Not Present !!!");
  }
});

// Get Zendesk Negative Statements
app.get("/get_zendesk_negative_statements", (req, res) => {
  console.log("Zendesk negative statements details request received");
  if (req.query.user_zen_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.zendeskStatements where user_zen_id='${req.query.user_zen_id}' and sentiment='Negative' LIMIT 10`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User user_zen_id Not Present !!!");
  }
});

// Get Freshdesk Negative Statements
app.get("/get_freshdesk_negative_statements", (req, res) => {
  console.log("Freshdesk negative statements details request received");
  if (req.query.user_fresh_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.freshdeskStatements where user_fresh_id='${req.query.user_fresh_id}' and sentiment='Negative' LIMIT 10`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User user_fresh_id Not Present !!!");
  }
});

// Get Hubspot Negative Statements
app.get("/get_hubspot_negative_statements", (req, res) => {
  console.log("Hubspot negative statements details request received");
  if (req.query.user_hub_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.hubStatements where user_hub_id='${req.query.user_hub_id}' and sentiment='Negative' LIMIT 10`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User user_hub_id Not Present !!!");
  }
});

// Get Youtube Negative Statements
app.get("/get_youtube_negative_statements", (req, res) => {
  console.log("Youtube negative statements details request received");
  if (req.query.user_ytsc_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.youtubeStatements where user_ytsc_id='${req.query.user_ytsc_id}' and sentiment='Negative' LIMIT 10`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User user_ytsc_id  Not Present !!!");
  }
});

// Get Youtube Ts Negative Statements
app.get("/get_youtube_ts_negative_statements", (req, res) => {
  console.log("Youtube Ts negative statements details request received");
  if (req.query.user_ytsc_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.youtubeTsStatements where user_ytsc_id='${req.query.user_ytsc_id}' and sentiment='Negative' LIMIT 10`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User user_ytsc_id  Not Present !!!");
  }
});

// Get Amazon Negative Statements
app.get("/get_amazon_negative_statements", authorizeUser, (req, res) => {
  console.log("Amazon negative statements details request received");
  if (req.query.user_azsc_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.amazonStatements where user_azsc_id='${req.query.user_azsc_id}' and sentiment='Negative' LIMIT 10`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User user_azsc_id  Not Present !!!");
  }
});

// Get Survey Negative Statements
app.get("/get_survey_negative_statements", (req, res) => {
  console.log("Survey negative statements details request received");
  if (req.query.database_unique_survey_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.statements where survey_id='${req.query.database_unique_survey_id}' and sentiment='Negative' LIMIT 10`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("database_unique_survey_id  Not Present !!!");
  }
});

// search_trustpilot_negative_statements
app.get("/search_trustpilot_negative_statements", (req, res) => {
  console.log("Trustpilot Negative Statements search request received");
  if (req.query.user_trustpilot_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.trustpilotSc where user_trustpilot_id='${req.query.user_trustpilot_id}' and Body like '%${req.query.word}%' and sentiments='NEGATIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_trustpilot_id Id or Word Not Present !!!");
  }
});

// search_playstore_negative_statements
app.get("/search_playstore_negative_statements", (req, res) => {
  console.log("Playstore Negative Statements search request received");
  if (req.query.user_gpsc_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.googlePlaystoreSc where user_gpsc_id='${req.query.user_gpsc_id}' and Body like '%${req.query.word}%' and sentiments='NEGATIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_gpsc_id Id or Word Not Present !!!");
  }
});

// search_zendesk_negative_statements
app.get("/search_zendesk_negative_statements", (req, res) => {
  console.log("Zendesk Negative Statements search request received");
  if (req.query.user_zen_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.zendeskSc where user_zen_id='${req.query.user_zen_id}' and Body like '%${req.query.word}%' and sentiments='NEGATIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_zen_id Id or Word Not Present !!!");
  }
});

// search_freshdesk_negative_statements
app.get("/search_freshdesk_negative_statements", (req, res) => {
  console.log("Freshdesk Negative Statements search request received");
  if (req.query.user_fresh_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.freshSc where user_fresh_id='${req.query.user_fresh_id}' and Body like '%${req.query.word}%' and sentiments='NEGATIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_fresh_id Id or Word Not Present !!!");
  }
});

// search_hubspot_negative_statements
app.get("/search_hubspot_negative_statements", (req, res) => {
  console.log("Hubspot Negative Statements search request received");
  if (req.query.user_hub_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.hubSc where user_hub_id='${req.query.user_hub_id}' and Body like '%${req.query.word}%' and sentiments='NEGATIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_hub_id Id or Word Not Present !!!");
  }
});

// search_youtube_negative_statements
app.get("/search_youtube_negative_statements", (req, res) => {
  console.log("Youtube Negative Statements search request received");
  if (req.query.user_ytsc_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.youtubeSc where user_ytsc_id='${req.query.user_ytsc_id}' and Body like '%${req.query.word}%' and sentiments='NEGATIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_ytsc_id Id or Word Not Present !!!");
  }
});

// search_youtube_ts_negative_statements
app.get("/search_youtube_ts_negative_statements", (req, res) => {
  console.log("Youtube Ts Negative Statements search request received");
  if (req.query.user_ytsc_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.youtubeTranscriptSc where user_ytsc_id='${req.query.user_ytsc_id}' and Body like '%${req.query.word}%' and sentiments='NEGATIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_ytsc_id Id or Word Not Present !!!");
  }
});

// search_amazon_negative_statements
app.get("/search_amazon_negative_statements", authorizeUser, (req, res) => {
  console.log("Amazon Negative Statements search request received");
  if (req.query.user_azsc_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.amazonReviewsSc where user_azsc_id='${req.query.user_azsc_id}' and Body like '%${req.query.word}%' and sentiments='NEGATIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_azsc_id Id or Word Not Present !!!");
  }
});

// search_survey_negative_statements
app.get("/search_survey_negative_statements", (req, res) => {
  console.log("Survey Negative Statements search request received");
  if (req.query.database_unique_survey_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.answers where survey_id='${req.query.database_unique_survey_id}' and answer like '%${req.query.word}%' and sentiment='NEGATIVE'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("database_unique_survey_id Id or Word Not Present !!!");
  }
});

// Survey Keywords based
// Get Keywords
app.get("/get_keywords", authorizeUser, (req, res) => {
  console.log("Keywords details request received");
  if (req.query.survey_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.keywords where survey_id='${req.query.survey_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("Survey Id Not Present !!!");
  }
});

// Search keywords in answers
app.get("/search_keyword", authorizeUser, (req, res) => {
  console.log("Keyword search request received");
  if (req.query.survey_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.answers where survey_id='${req.query.survey_id}' and answer like '%${req.query.word}%'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("Survey Id or word Not Present !!!");
  }
});

// Searching a contact person
app.get("/search_person", authorizeUser, (req, res) => {
  if (req.query.person) {
    console.log("Search Contact person request received");
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.contacts where name like '%${req.query.person}%'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  }
});

// Upload contacts
app.post("/contacts_upload", authorizeUser, (req, res) => {
  if (req.query.email && req.query.name) {
    console.log("Group add contacts request received");
    con.connect(function (err) {
      con.query(
        `INSERT INTO happyagility.contacts (account_id, status, email,group_id,name,group_name,phone) select * from (select '${req.query.account_id}','${req.query.status}', '${req.query.email}', '${req.query.group_id}', '${req.query.name}', '${req.query.group_name}','${req.query.phone}') as tmp where not exists ( select group_id, email from happyagility.contacts where email='${req.query.email}' and group_id='${req.query.group_id}')`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  }
});

// Update profile with job title and organization name
app.post("/update_profile", authorizeUser, (req, res) => {
  if (req.query.user_id) {
    console.log("Request received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.accounts SET job_title="${req.query.job_title}", industry_name="${req.query.org_name}" where account_id="${req.query.user_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    res.send({ status: 400 });
  }
});

// Update user subscription
app.post("/upgradeUser", (req, res) => {
  if (req.query.user_id) {
    console.log("Update user subscription received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.accounts SET account_type="premium", subscription_type="premium" where account_id="${req.query.user_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("User Id Missing");
  }
});

// Survey Layout Save
app.post("/save_survey_layout", (req, res) => {
  if (req.query.database_unique_survey_id) {
    console.log("Survey Layout change request received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET survey_layout="${req.query.survey_layout}" where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("Database unique survey id Missing");
  }
});

// Update left and right text
app.post("/update_left_right_text", (req, res) => {
  if (req.query.database_unique_survey_id) {
    console.log("Left and Right Text Change Request Received");
    console.log(
      req.query.database_unique_survey_id,
      req.query.left_text,
      req.query.right_text
    );
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET left_text="${req.query.left_text}", right_text="${req.query.right_text}", secondText="${req.query.secondText}", thirdText="${req.query.thirdText}", fourthText="${req.query.fourthText}" where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("User Id Missing");
  }
});

// Update start time
app.post("/update_start_time", (req, res) => {
  if (req.query.database_unique_survey_id) {
    console.log("Start time Change Request Received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET start_time="${req.query.start_time}" where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("User Id Missing");
  }
});

// Update start time
app.post("/update_end_time", (req, res) => {
  if (req.query.database_unique_survey_id) {
    console.log("End time Change Request Received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET end_time="${req.query.end_time}" where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("User Id Missing");
  }
});

// Update close date
app.post("/update_close_date", (req, res) => {
  if (req.query.database_unique_survey_id) {
    console.log("Close date Change Request Received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET closed_date="${req.query.closed_date}" where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("survey_id Missing");
  }
});

// Update only left text
app.post("/update_left_text", (req, res) => {
  if (req.query.database_unique_survey_id) {
    console.log("Left Text Change Request Received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET left_text="${req.query.left_text}" where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("User Id Missing");
  }
});

// Update only right text
app.post("/update_right_text", (req, res) => {
  if (req.query.database_unique_survey_id) {
    console.log("Right Text Change Request Received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET right_text="${req.query.right_text}" where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("User Id Missing");
  }
});

app.post("/update_second_text", (req, res) => {
  if (req.query.database_unique_survey_id) {
    console.log("Second Text Change Request Received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET secondText="${req.query.second_text}" where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("database_unique_survey_id Missing");
  }
});

app.post("/update_third_text", (req, res) => {
  if (req.query.database_unique_survey_id) {
    console.log("Third Text Change Request Received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET thirdText="${req.query.third_text}" where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("database_unique_survey_id Missing");
  }
});

app.post("/update_Fourth_text", (req, res) => {
  if (req.query.database_unique_survey_id) {
    console.log("Fourth Text Change Request Received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET fourthText="${req.query.fourth_text}" where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("database_unique_survey_id Missing");
  }
});

// Update follow up
app.post("/update_follow_up", (req, res) => {
  if (req.query.database_unique_survey_id) {
    console.log("Follow up text Change Request Received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET follow_up_question="${req.query.follow_up_question}" where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("database_unique_survey_id Missing");
  }
});

// Update Introduction Text
app.post("/update_introduction_text", (req, res) => {
  if (req.query.database_unique_survey_id) {
    console.log("Introduction text Change Request Received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET introduction="${req.query.introduction_text}" where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("database_unique_survey_id Missing");
  }
});

// // Get the user info by user_id
// app.get("/user_info", (req, res) => {
//   async function letsAuth() {
//     const result = await authorizeUser(
//       req.query.login_used,
//       req.headers.authorization
//     );
//     if (result === "Authorized C" || result === "Authorized G") {
//       if (req.query.user_id) {
//         con.connect(function (err) {
//           con.query(
//             `SELECT * FROM happyagility.accounts where account_id='${req.query.user_id}'`,
//             function (err, result) {
//               if (err) res.send(err);
//               if (result) res.send(result);
//             }
//           );
//         });
//       } else {
//         res.send({ status: 400 });
//       }
//     } else {
//       res.send({ status: 401 });
//     }
//   }
//   letsAuth();
// });

// Get the user info by user_id
app.get("/user_info", authorizeUser, (req, res) => {
  console.log("User info request received");
  if (req.query.user_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.accounts where account_id='${req.query.user_id}'`,
        function (err, result) {
          if (err) {
            console.log(err);
            res.send("err", err);
          }
          if (result) {
            console.log("result", result);
            res.send(result);
          }
        }
      );
    });
  } else {
    res.send({ status: 400 });
  }
});

// group list download
app.get("/group_list", authorizeUser, (req, res) => {
  if (req.query.group_id) {
    con.connect(function (err) {
      con.query(
        `Select * from happyagility.contacts where group_id='${req.query.group_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  }
});

//fetch contact details
app.get("/contact_details", authorizeUser, (req, res) => {
  console.log("Contact Details Requested");
  if (req.query.account_id) {
    con.connect(function (err) {
      con.query(
        `Select * from  happyagility.contacts where account_id='${req.query.account_id}'`,
        function (err, result, fields) {
          if (err) console.log(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    res.send({ status: 400 });
  }
});

// This is to add survey when newly created
app.post("/add_survey", (req, res) => {
  if (req.query.user_id && req.query.survey_name && req.query.language) {
    console.log("Create and add new survey request received");
    con.connect(function (err) {
      con.query(
        `INSERT INTO happyagility.surveys (user_id, user_email, survey_name, language, follow_up_question, status, survey_type, appearance_question_color, appearance_answer_color, appearance_button_color, bold, italic, underline, database_unique_survey_id, survey_datetime, survey_layout, survey_bg_image) VALUES ('${req.query.user_id}','${req.query.user_email}', '${req.query.survey_name}','${req.query.language}','${req.query.follow_up_question}','${req.query.status}','${req.query.survey_type}','${req.query.appearance_question_color}','${req.query.appearance_answer_color}','${req.query.appearance_button_color}','${req.query.bold}','${req.query.italic}','${req.query.underline}','${req.query.database_unique_survey_id}','${req.query.survey_datetime}','left-full-screen','surveybg2')`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result)
            res.send({
              user_id: req.query.user_id,
              survey_name: req.query.survey_name,
              language: req.query.language,
            });
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("Survey Creation not possible as user_id is missing");
  }
});

// Clone Survey
app.post("/clone_survey", (req, res) => {
  console.log("Clone survey request received");
  con.connect(function (err) {
    console.log(req.query);
    var values = [
      [
        req.query.user_id,
        req.query.user_email,
        req.query.survey_name,
        req.query.language,
        req.query.follow_up_question,
        req.query.status,
        req.query.survey_type,
        req.query.appearance_question_color,
        req.query.appearance_answer_color,
        req.query.appearance_button_color,
        req.query.bold,
        req.query.italic,
        req.query.underline,
        req.query.database_unique_survey_id,
        req.query.survey_datetime,
        req.query.bil,
        req.query.bis,
        req.query.bn,
        req.query.ip,
        req.query.lt,
        req.query.rt,
        req.query.sbn,
        req.query.sl,
        req.query.brandLocation,
        req.query.blockIp,
        req.query.couponDate,
        req.query.couponCode,
        req.query.couponEnable,
        req.query.secondText,
        req.query.thirdText,
        req.query.fourthText,
        req.query.passwordProtected,
        req.query.surveyPassword,
        req.query.locationTrack,
        req.query.introduction,
        req.query.verify,
        req.query.start_time,
        req.query.end_time,
      ],
    ];
    con.query(
      "INSERT INTO happyagility.surveys (user_id, user_email, survey_name, language, follow_up_question, status, survey_type, appearance_question_color, appearance_answer_color, appearance_button_color, bold, italic, underline, database_unique_survey_id, survey_datetime, brand_image_link, brand_image_size, brand_name, ip_limit, left_text, right_text, survey_bg_image, survey_layout, brand_location, blockIp,coupon_date, coupon_code, coupon_enable, secondText, thirdText, fourthText, password_protected, survey_password, location_track, introduction, verify, start_time, end_time ) VALUES ?",
      [values],
      function (err, result0, fields) {
        if (err) {
          console.log(err);
          res.send(err);
        }
        if (result0) {
          console.log("Survey skeleton cloned, further cloning questions");
          con.query(
            `SELECT * FROM happyagility.questions where survey_id=${req.query.shid}`,
            function (err, result) {
              if (err) console.log(err);
              if (result) {
                var normal_questions_list = [];
                var child_questions_list = [];
                for (var qtn = 0; qtn < result.length; qtn++) {
                  if (result[qtn].database_question_id.length < 14) {
                    normal_questions_list.push(result[qtn]);
                  } else {
                    child_questions_list.push(result[qtn]);
                  }
                }
                for (var cql = 0; cql < child_questions_list.length; cql++) {
                  var normalQuestionId = child_questions_list[
                    cql
                  ].database_question_id.substring(0, 13);
                  for (var nql = 0; nql < normal_questions_list.length; nql++) {
                    if (
                      normal_questions_list[nql].database_question_id ===
                      normalQuestionId
                    ) {
                      normal_questions_list.splice(
                        nql + 1,
                        0,
                        child_questions_list[cql]
                      );
                      break;
                    }
                  }
                }

                var all_linked_question_ids = [];
                var all_linked_label_ids = [];
                normal_questions_list.map((rkt, i) => {
                  var dbquid = new Date().valueOf() + i;
                  if (rkt.answer_type === "Label") {
                    all_linked_label_ids.push([
                      dbquid,
                      rkt.database_question_id,
                    ]);
                  } else {
                    if (
                      rkt.linking !== null &&
                      rkt.linking !== "null" &&
                      rkt.linking !== undefined &&
                      rkt.linking !== "undefined" &&
                      rkt.linking.length > 4
                    ) {
                      all_linked_question_ids.push([dbquid, rkt.linking]);
                    }
                  }
                  var values1 = [
                    [
                      req.query.database_unique_survey_id,
                      rkt.questionText,
                      rkt.answer_type,
                      dbquid,
                      rkt.option1,
                      rkt.option2,
                      rkt.option3,
                      rkt.option4,
                      rkt.option5,
                      rkt.compulsory,
                      rkt.analytics,
                      rkt.option1Conv,
                      rkt.option2Conv,
                      rkt.option3Conv,
                      rkt.option4Conv,
                      rkt.option5Conv,
                      rkt.questionTextConv,
                      rkt.answer1,
                      rkt.answer2,
                      rkt.answer3,
                      rkt.answer4,
                      rkt.answer5,
                      rkt.marks,
                      rkt.on_page,
                      rkt.label,
                      rkt.questionLink,
                      rkt.filter1,
                      rkt.filter2,
                      rkt.filter3,
                      rkt.filter4,
                      rkt.filter5,
                      rkt.linking,
                    ],
                  ];
                  con.connect(function (err) {
                    con.query(
                      `INSERT INTO happyagility.questions (survey_id, questionText, answer_type, database_question_id, option1, option2, option3, option4, option5, compulsory, analytics, option1Conv, option2Conv, option3Conv, option4Conv, option5Conv, questionTextConv, answer1, answer2, answer3, answer4, answer5, marks, on_page, label, questionLink, filter1, filter2, filter3, filter4, filter5, linking) VALUES ?`,
                      [values1],
                      function (err, result1, fields) {
                        if (err) console.log(err);
                        if (result1) {
                          console.log(
                            "Question cloned, maybe further still cloning questions",
                            i,
                            result.length
                          );
                          if (i === result.length - 1) {
                            console.log("Updating 0");

                            for (
                              var lm = 0;
                              lm < all_linked_question_ids.length;
                              lm++
                            ) {
                              for (
                                var np = 0;
                                np < all_linked_label_ids.length;
                                np++
                              ) {
                                if (
                                  all_linked_question_ids[lm][1] ===
                                  all_linked_label_ids[np][1]
                                ) {
                                  console.log("Updating");
                                  con.connect(function (err) {
                                    con.query(
                                      `UPDATE happyagility.questions SET linking="${all_linked_label_ids[np][0]}" where database_question_id="${all_linked_question_ids[lm][0]}"`,
                                      function (err, result, fields) {
                                        if (err) {
                                          console.log(err);
                                        }
                                        if (result) {
                                          console.log(result);
                                        }
                                        if (fields) console.log(fields);
                                      }
                                    );
                                  });
                                }
                              }
                            }
                          }
                        }

                        if (fields) console.log(fields);
                      }
                    );
                  });
                });
              }
            }
          );
          con.query(
            `SELECT * FROM happyagility.surveyFilters where survey_id=${req.query.shid}`,
            function (err, result2, fields) {
              if (err) console.log(err);
              if (result2) {
                console.log(result2);
                if (result2.length === 0) {
                  res.send({
                    allgood: "all_good",
                  });
                }
                for (var i = 0; i < result2.length; i++) {
                  var values2 = [
                    [
                      result2[i].filter_name,
                      result2[i].category_name,
                      result2[i].option_name,
                      req.query.database_unique_survey_id,
                    ],
                  ];
                  con.connect(function (err) {
                    con.query(
                      `INSERT INTO happyagility.surveyFilters (filter_name, category_name, option_name, survey_id) VALUES ?`,
                      [values2],
                      function (err, result3, fields) {
                        if (err) res.send(err);
                        if (i === result2.length - 1 && result3) {
                          console.log(
                            "Filters cloned for survey hence completed"
                          );
                          res.send({
                            allgood: "all_good",
                          });
                        }
                        if (fields) console.log(fields);
                      }
                    );
                  });
                }
              }
            }
          );
        }
        if (fields) console.log(fields);
      }
    );
  });
});

// This is to get particular survey detail
app.get("/survey_details", (req, res) => {
  if (req.query.database_unique_survey_id) {
    console.log("Survey Details Request Received");
    con.query(
      `SELECT * FROM happyagility.surveys where database_unique_survey_id=${req.query.database_unique_survey_id}`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  } else {
    console.log("Database unique survey_id not present");
  }
});

// This is to get survey details for NPS Dash Overview
app.get("/survey_details_for_npsdash_overview", authorizeUser, (req, res) => {
  if (req.query.database_unique_survey_id) {
    console.log("Survey Details For NPS Dash Overview Request Received");
    con.query(
      `SELECT brand_name,brand_location,follow_up_question,survey_type,latest_score FROM happyagility.surveys where database_unique_survey_id=${req.query.database_unique_survey_id}`,
      function (err, result) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  } else {
    console.log("Database unique survey_id not present");
  }
});

// Survey Details by user
app.get("/survey_details_userid", (req, res) => {
  if (req.query.user_id) {
    console.log("Survey Details Request Received");
    con.query(
      `SELECT * FROM happyagility.surveys where user_id="${req.query.user_id}"`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  } else {
    console.log("User_id not present");
  }
});

// Password enable
app.post("/password_update", (req, res) => {
  if (req.query.password_protected && req.query.survey_password) {
    console.log("Password Update Request received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET password_protected=${
          req.query.password_protected
        }, survey_password="${passwordHash.generate(
          req.query.survey_password
        )}" where database_unique_survey_id="${
          req.query.database_unique_survey_id
        }"`,
        function (err, result, fields) {
          if (err) console.log(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  }
});

// Password Disable
app.post("/password_off", (req, res) => {
  if (req.query.password_protected) {
    console.log("Password Off Request received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET password_protected=${req.query.password_protected}, survey_password="" where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) console.log(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  }
});

// ip-tracking
app.post("/ip_update", (req, res) => {
  if (req.query.database_unique_survey_id && req.query.ip_limit) {
    console.log("Ip Limit Update Request received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET ip_limit='${req.query.ip_limit}' where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) console.log(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("Something went wrong");
  }
});

// ip-tracking
app.post("/location_ask_update", (req, res) => {
  if (req.query.database_unique_survey_id && req.query.location_track) {
    console.log("Ask Location Update Request received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET location_track='${req.query.location_track}' where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) console.log(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("Something went wrong");
  }
});

// ip-tracking
app.post("/verify_user_email_update", (req, res) => {
  if (req.query.database_unique_survey_id && req.query.verify) {
    console.log("Verify User Email Update Request received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET verify='${req.query.verify}' where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) console.log(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("Something went wrong");
  }
});

// End Url Info related to user
app.get("/end_url_info", (req, res) => {
  if (req.query.user_id) {
    console.log("End url Details Request Received");
    con.query(
      `SELECT * FROM happyagility.trustpilotRequest where user_id='${req.query.user_id}'`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  } else {
    console.log("User_id not present");
  }
});

// Add Trustpilot URL to scrape data
app.post("/trustpilot_url_add", (req, res) => {
  if (req.query.user_id && req.query.website) {
    console.log("Website Save Request Received");
    con.connect(function (err) {
      con.query(
        `INSERT INTO happyagility.trustpilotRequest (website, user_id) VALUES ('${req.query.website}', '${req.query.user_id}')`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("User_id or Website Detail not present");
    res.send("Required Info Missing");
  }
});

// App Url Info related to user - google playstore
app.get("/app_url_info", (req, res) => {
  if (req.query.user_id) {
    console.log("App url Details Request Received");
    con.query(
      `SELECT * FROM happyagility.googlePlaystoreRequest where user_id='${req.query.user_id}'`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  } else {
    console.log("User_id not present");
  }
});

// App Url Info related to user - Zendesk
app.get("/zendesk_url_info", (req, res) => {
  if (req.query.user_id) {
    console.log("Zendesk url Details Request Received");
    con.query(
      `SELECT * FROM happyagility.zendeskRequest where user_id='${req.query.user_id}'`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  } else {
    console.log("User_id not present");
  }
});

// App Url Info related to user - Freshdesk
app.get("/freshdesk_url_info", (req, res) => {
  if (req.query.user_id) {
    console.log("Freshdesk url Details Request Received");
    con.query(
      `SELECT * FROM happyagility.freshdeskRequest where user_id='${req.query.user_id}'`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  } else {
    console.log("User_id not present");
  }
});

// App Url Info related to user - Hubspot
app.get("/hubspot_url_info", (req, res) => {
  if (req.query.user_id) {
    console.log("Hubspot url Details Request Received");
    con.query(
      `SELECT * FROM happyagility.hubRequest where user_id='${req.query.user_id}'`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  } else {
    console.log("User_id not present");
  }
});

// Add Playstore URL to scrape data
app.post("/playstore_url_add", (req, res) => {
  if (req.query.user_id && req.query.website) {
    console.log("playstore Save Request Received");
    con.connect(function (err) {
      con.query(
        `INSERT INTO happyagility.googlePlaystoreRequest (website, user_id) VALUES ('${req.query.website}', '${req.query.user_id}')`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("User_id or Website Detail not present");
    res.send("Required Info Missing");
  }
});

// Add Zendesk URL to scrape data
app.post("/zendesk_url_add", (req, res) => {
  if (req.query.user_id && req.query.website) {
    console.log("Zendesk Save Request Received");
    con.connect(function (err) {
      con.query(
        `INSERT INTO happyagility.zendeskRequest (website, user_id, email_id, password) VALUES ('${req.query.website}', '${req.query.user_id}', '${req.query.email_id}', '${req.query.password}')`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("User_id or Website Detail not present");
    res.send("Required Info Missing");
  }
});

// Add Freshdesk URL to scrape data
app.post("/freshdesk_url_add", (req, res) => {
  if (req.query.user_id && req.query.website) {
    console.log("Freshdesk Save Request Received");
    con.connect(function (err) {
      con.query(
        `INSERT INTO happyagility.freshdeskRequest (website, user_id, api_key) VALUES ('${req.query.website}', '${req.query.user_id}', '${req.query.api_key}')`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("User_id or Website Detail not present");
    res.send("Required Info Missing");
  }
});

// Add Hubspot URL to scrape data
app.post("/hubspot_url_add", (req, res) => {
  if (req.query.user_id && req.query.website) {
    console.log("Hubspot Save Request Received");
    con.connect(function (err) {
      con.query(
        `INSERT INTO happyagility.hubRequest (website, user_id, api_key) VALUES ('${req.query.website}', '${req.query.user_id}','${req.query.website}')`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("User_id or Website Detail not present");
    res.send("Required Info Missing");
  }
});

// Youtube Url Info related to user - youtube
app.get("/yt_url_info", (req, res) => {
  if (req.query.user_id) {
    console.log("Youtube url Details Request Received");
    con.query(
      `SELECT * FROM happyagility.youtubeRequest where user_id='${req.query.user_id}'`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  } else {
    console.log("User_id not present");
  }
});

// Youtube Url Info related to user - youtube
app.get("/yt_ts_url_info", (req, res) => {
  if (req.query.user_id) {
    console.log("Youtube TS url Details Request Received");
    con.query(
      `SELECT * FROM happyagility.youtubeTsRequest where user_id='${req.query.user_id}'`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  } else {
    console.log("User_id not present");
  }
});

// Amazon Url Info related to user - youtube
app.get("/az_url_info", (req, res) => {
  if (req.query.user_id) {
    console.log("Amazon url Details Request Received");
    con.query(
      `SELECT * FROM happyagility.amazonRequest where user_id='${req.query.user_id}'`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  } else {
    console.log("User_id not present");
  }
});

// Zendesk Url Info related to user - youtube
app.get("/zd_url_info", (req, res) => {
  if (req.query.user_id) {
    console.log("Zendesk url Details Request Received");
    con.query(
      `SELECT * FROM happyagility.zendeskRequest where user_id='${req.query.user_id}'`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  } else {
    console.log("User_id not present");
  }
});

// Freshdesk Url Info related to user - youtube
app.get("/fd_url_info", (req, res) => {
  if (req.query.user_id) {
    console.log("Freshdesk url Details Request Received");
    con.query(
      `SELECT * FROM happyagility.freshdeskRequest where user_id='${req.query.user_id}'`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  } else {
    console.log("User_id not present");
  }
});

// Hubspot Url Info related to user - youtube
app.get("/hs_url_info", (req, res) => {
  if (req.query.user_id) {
    console.log("Hubspot url Details Request Received");
    con.query(
      `SELECT * FROM happyagility.hubRequest where user_id='${req.query.user_id}'`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  } else {
    console.log("User_id not present");
  }
});

// Add Youtube URL to scrape data
app.post("/youtube_url_add", (req, res) => {
  if (req.query.user_id && req.query.website) {
    console.log("Youtube Save Request Received");
    con.connect(function (err) {
      con.query(
        `INSERT INTO happyagility.youtubeRequest (website, user_id) VALUES ('${req.query.website}', '${req.query.user_id}')`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("User_id or Website Detail not present");
    res.send("Required Info Missing");
  }
});

// Add Youtube URL to scrape data
app.post("/youtube_ts_url_add", (req, res) => {
  if (req.query.user_id && req.query.website) {
    console.log("Youtube Ts Save Request Received");
    con.connect(function (err) {
      con.query(
        `INSERT INTO happyagility.youtubeTsRequest (website, user_id) VALUES ('${req.query.website}', '${req.query.user_id}')`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) {
            res.send(result);
            request(
              `https://python-ha.herokuapp.com/youtube_transcript?user_ytsc_id=${req.query.website}&user_id=${req.query.user_id}`,
              function (error, response, body) {
                console.log(body);
              }
            );
          }
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("User_id or Website Detail not present");
    res.send("Required Info Missing");
  }
});

// Add Amazon URL to scrape data
app.post("/amazon_url_add", (req, res) => {
  if (req.query.user_id && req.query.website) {
    console.log("Amazon Save Request Received");
    con.connect(function (err) {
      con.query(
        `INSERT INTO happyagility.amazonRequest (website, user_id, type) VALUES ('${req.query.website}', '${req.query.user_id}','${req.query.type}')`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) {
            res.send(result);
            // request(
            //   `https://python-ha.herokuapp.com/amazon_reviews?user_azsc_id=${encodeURIComponent(
            //     req.query.website
            //   )}&user_id=${req.query.user_id}&type=${req.query.type}`,
            //   function (error, response, body) {
            //     console.log(body);
            //   }
            // );
          }
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("User_id or Website Detail not present");
    res.send("Required Info Missing");
  }
});

// This is to update profile picture when uploaded with new image
app.post("/upload_profile_pic", authorizeUser, (req, res) => {
  if (req.query.user_id && req.query.profilePic) {
    console.log("Request received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.accounts SET profile_pic="${req.query.profilePic}" where account_id="${req.query.user_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    res.send({ status: 400 });
  }
});

// This is to update the brand details of the particular survey
app.post("/upload_brand_details", (req, res) => {
  if (req.query.database_unique_survey_id) {
    console.log("Brand Details Upload Request Received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET brand_name="${req.query.brand_name}", brand_image_link="${req.query.brand_pic}",brand_image_size=${req.query.brand_size}  where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  }
});

// Upload brand Name
app.post("/upload_brand_name", (req, res) => {
  if (req.query.database_unique_survey_id) {
    console.log("Brand Name Upload Request Received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET brand_name="${req.query.brand_name}" where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  }
});

// Upload brand Image
app.post("/upload_brand_image", (req, res) => {
  if (req.query.database_unique_survey_id) {
    console.log("Brand Image Upload Request Received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET brand_image_link="${req.query.brand_pic}" where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  }
});

// Upload brand Image Size
app.post("/upload_brand_image_size", (req, res) => {
  if (req.query.database_unique_survey_id) {
    console.log(
      "Brand Image Size Upload Request Received",
      req.query.brand_size
    );
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET brand_image_size=${req.query.brand_size} where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  }
});

// This is to update the target details of the particular survey
app.post("/upload_target", (req, res) => {
  if (req.query.database_unique_survey_id) {
    console.log("Target Upload Request Received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET target="${req.query.target}" where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  }
});

// this is to publish the survey
app.post("/publish_survey", (req, res) => {
  if (req.query.database_unique_survey_id) {
    console.log("Request Received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET status="${req.query.status}" where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  }
});

// coupon update
app.post("/coupon_update", authorizeUser, (req, res) => {
  if (req.query.user_id && req.query.survey_name) {
    con.connect(function (err) {
      if (req.query.survey_name !== "Select All") {
        con.query(
          `UPDATE happyagility.surveys SET coupon_code="${req.query.coupon_code}", coupon_date="${req.query.coupon_date}",coupon_enable="Yes" where user_id="${req.query.user_id}" and survey_name="${req.query.survey_name}"`,
          function (err, result, fields) {
            if (err) res.send(err);
            if (result) res.send(result);
            if (fields) console.log(fields);
          }
        );
      } else {
        con.query(
          `UPDATE happyagility.surveys SET coupon_code="${req.query.coupon_code}", coupon_date="${req.query.coupon_date}",coupon_enable="Yes" where user_id="${req.query.user_id}"`,
          function (err, result, fields) {
            if (err) res.send(err);
            if (result) res.send(result);
            if (fields) console.log(fields);
          }
        );
      }
    });
  } else {
    res.send({ status: 400 });
  }
});
// Disable coupon for a particular survey
app.post("/disable_coupon", authorizeUser, (req, res) => {
  if (req.query.survey_name) {
    console.log("Request received");

    con.connect(function (err) {
      if (req.query.survey_name !== "Select All") {
        con.query(
          `UPDATE happyagility.surveys SET coupon_enable="No",coupon_code="", coupon_date="" where survey_name="${req.query.survey_name}"`,
          function (err, result, fields) {
            if (err) res.send(err);
            if (result) res.send(result);
            if (fields) console.log(fields);
          }
        );
      } else {
        con.query(
          `UPDATE happyagility.surveys SET coupon_enable="No",coupon_code="", coupon_date="" where user_id="${req.query.user_id}"`,
          function (err, result, fields) {
            if (err) res.send(err);
            if (result) res.send(result);
            if (fields) console.log(fields);
          }
        );
      }
    });
  } else {
    console.log("Survey Name Missing");
  }
});

// This is to add questions to the survey
app.post("/add_question", (req, res) => {
  console.log("Add Question Request received");
  con.connect(function (err) {
    var values = [
      [
        req.body.database_unique_survey_id,
        req.body.questionText,
        req.body.answer_type,
        req.body.database_question_id,
        req.body.option1,
        req.body.option2,
        req.body.option3,
        req.body.option4,
        req.body.option5,
        req.body.compulsory,
        req.body.analytics,
        req.body.option1Conv,
        req.body.option2Conv,
        req.body.option3Conv,
        req.body.option4Conv,
        req.body.option5Conv,
        req.body.questionTextConv,
        req.body.label,
        req.body.questionLink,
        req.body.filter1,
        req.body.filter2,
        req.body.filter3,
        req.body.filter4,
        req.body.filter5,
        req.body.linking,
        req.body.showText,
        req.body.on_page,
      ],
    ];
    con.query(
      `INSERT INTO happyagility.questions (survey_id, questionText, answer_type, database_question_id, option1, option2, option3, option4, option5, compulsory, analytics, option1Conv, option2Conv, option3Conv, option4Conv, option5Conv, questionTextConv, label, questionLink, filter1, filter2, filter3, filter4, filter5, linking, showText, on_page) VALUES ?`,
      [values],
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) {
          con.query(
            `SELECT question_id FROM happyagility.questions where database_question_id='${req.query.database_question_id}'`,
            function (err, result) {
              if (err) res.send(err);
              if (result) res.send(result);
            }
          );
        }
        if (fields) console.log(fields);
      }
    );
  });
});

// Updating already saved question
app.post("/update_question", (req, res) => {
  console.log("Update question Request received");
  con.connect(function (err) {
    con.query(
      `UPDATE happyagility.questions SET questionText="${req.body.questionText}", answer_type="${req.body.answer_type}", option1="${req.body.option1}", option2="${req.body.option2}", option3="${req.body.option3}", option4="${req.body.option4}", option5="${req.body.option5}", compulsory="${req.body.compulsory}", analytics="${req.body.analytics}", option1Conv="${req.body.option1Conv}", option2Conv="${req.body.option2Conv}", option3Conv="${req.body.option3Conv}", option4Conv="${req.body.option4Conv}", option5Conv="${req.body.option5Conv}", questionTextConv="${req.body.questionTextConv}", label="${req.body.label}", questionLink="${req.body.questionLink}", filter1="${req.body.filter1}", filter2="${req.body.filter2}", filter3="${req.body.filter3}", filter4="${req.body.filter4}", filter5="${req.body.filter5}", linking="${req.body.linking}", showText='${req.body.showText}', on_page=${req.body.on_page} where database_question_id="${req.body.database_question_id}"`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
        if (fields) console.log(fields);
      }
    );
  });
});

// This is to add duplicate question to the survey
app.post("/add_duplicate_question", (req, res) => {
  if (
    req.query.database_unique_survey_id &&
    req.query.questionText &&
    req.query.answer_type &&
    req.query.database_question_id
  ) {
    console.log("Add duplicate question eequest received");
    con.connect(function (err) {
      var values = [
        [
          req.query.database_unique_survey_id,
          req.query.questionText,
          req.query.answer_type,
          req.query.database_question_id,
          req.query.option1,
          req.query.option2,
          req.query.option3,
          req.query.option4,
          req.query.option5,
          req.query.compulsory,
          req.query.analytics,
          req.query.option1Conv,
          req.query.option2Conv,
          req.query.option3Conv,
          req.query.option4Conv,
          req.query.option5Conv,
          req.query.questionTextConv,
          req.query.label,
          req.query.questionLink,
          req.query.filter1,
          req.query.filter2,
          req.query.filter3,
          req.query.filter4,
          req.query.filter5,
          req.query.linking,
          req.query.showText,
        ],
      ];
      con.query(
        `INSERT INTO happyagility.questions (survey_id, questionText, answer_type, database_question_id, option1, option2, option3, option4, option5, compulsory, analytics, option1Conv, option2Conv, option3Conv, option4Conv, option5Conv, questionTextConv, label, questionLink, filter1, filter2, filter3, filter4, filter5, linking, showText) VALUES ?`,
        [values],
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("Maybe some parameter is missing");
  }
});

app.post("/exam_add_question", (req, res) => {
  if (
    req.query.database_unique_survey_id &&
    req.query.questionText &&
    req.query.answer_type &&
    req.query.database_question_id
  ) {
    console.log("Add Question Request received");
    con.connect(function (err) {
      con.query(
        `INSERT INTO happyagility.questions (survey_id, questionText, answer_type, database_question_id, option1,option2,option3,option4,option5,marks,answer1,answer2,answer3,answer4,answer5,on_page) VALUES ('${req.query.database_unique_survey_id}', '${req.query.questionText}','${req.query.answer_type}','${req.query.database_question_id}','${req.query.option1}','${req.query.option2}','${req.query.option3}','${req.query.option4}','${req.query.option5}','${req.query.marks}','${req.query.answer1}','${req.query.answer2}','${req.query.answer3}','${req.query.answer4}','${req.query.answer5}',${req.query.on_page})`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result)
            res.send({
              survey_id: req.query.database_unique_survey_id,
              questionText: req.query.questionText,
              answer_type: req.query.answer_type,
              database_question_id: req.query.database_question_id,
              option1: req.query.option1,
              option2: req.query.option2,
              option3: req.query.option3,
              option4: req.query.option4,
              option5: req.query.option5,
            });
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("Maybe some parameter is missing");
  }
});

// Updating already saved question
app.post("/exam_update_question", (req, res) => {
  if (
    req.query.database_unique_survey_id &&
    req.query.questionText &&
    req.query.answer_type &&
    req.query.database_question_id
  ) {
    console.log("Request received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.questions SET questionText="${req.query.questionText}", answer_type="${req.query.answer_type}", option1="${req.query.option1}", option2="${req.query.option2}", option3="${req.query.option3}", option4="${req.query.option4}", option5="${req.query.option5}", answer1="${req.query.answer1}", answer2="${req.query.answer2}", answer3="${req.query.answer3}", answer4="${req.query.answer4}", answer5="${req.query.answer5}", marks="${req.query.marks}", on_page=${req.query.on_page} where database_question_id="${req.query.database_question_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result)
            res.send({
              survey_id: req.query.database_unique_survey_id,
              questionText: req.query.questionText,
              answer_type: req.query.answer_type,
              database_question_id: req.query.database_question_id,
              option1: req.query.option1,
              option2: req.query.option2,
              option3: req.query.option3,
              option4: req.query.option4,
              option5: req.query.option5,
            });
          if (fields) console.log(fields);
        }
      );
    });
  }
});

// Deleting saved question
app.post("/delete_question", (req, res) => {
  console.log("Delete Question request incoming, verification in progress !");
  if (req.query.database_question_id) {
    console.log("Question deletion request received");
    con.connect(function (err) {
      con.query(
        `DELETE from happyagility.questions where database_question_id="${req.query.database_question_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result)
            res.send({
              database_question_id: req.query.database_question_id,
            });
          if (fields) console.log(fields);
        }
      );
    });
  }
});

// Deleting saved contact
app.post("/delete_contact", authorizeUser, (req, res) => {
  if (req.query.contact_email_id && req.query.group_id) {
    console.log("Contact deletion request received");
    con.connect(function (err) {
      con.query(
        `DELETE from happyagility.contacts where group_id="${req.query.group_id}" and email="${req.query.contact_email_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  }
});

// Unsubscribing saved contact
app.post("/unsubscribe_contact", authorizeUser, (req, res) => {
  if (req.query.contact_email_id && req.query.group_id) {
    console.log("Contact unsubscribe request received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.contacts SET status='inactive' where email='${req.query.contact_email_id}' and group_id='${req.query.group_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  }
});

// Subscribing saved contact
app.post("/subscribe_contact", authorizeUser, (req, res) => {
  if (req.query.contact_email_id && req.query.group_id) {
    console.log("Contact subscribe request received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.contacts SET status='active' where email='${req.query.contact_email_id}' and group_id='${req.query.group_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  }
});

// Deleting group list
app.post("/delete_group", authorizeUser, (req, res) => {
  if (req.query.group_id) {
    console.log("Group deletion request received");
    con.connect(function (err) {
      con.query(
        `DELETE from happyagility.contacts where group_id="${req.query.group_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  }
});

// survey and survey related questions deletion
app.post("/survey_deletion", authorizeUser, (req, res) => {
  if (req.query.database_unique_survey_id) {
    con.connect(function (err) {
      con.query(
        `DELETE from happyagility.surveys where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result0) {
          if (err) res.send(err);
          if (result0) {
            con.query(
              `DELETE from happyagility.questions where survey_id="${req.query.database_unique_survey_id}"`,
              function (err, result1) {
                if (err) res.send(err);
                if (result1) res.send(result1);
              }
            );
          }
        }
      );
    });
  } else {
    res.send({ status: 400 });
  }
});

// Close Survey
app.post("/close_survey", authorizeUser, (req, res) => {
  if (req.query.database_unique_survey_id) {
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET closed_date='${new Date()
          .toISOString()
          .slice(0, 19)
          .replace(
            "T",
            " "
          )}', status='Closed' where database_unique_survey_id='${
          req.query.database_unique_survey_id
        }'`,
        function (err, result) {
          if (err) res.send(err);
          if (result) {
            res.send(result);
          }
        }
      );
    });
  } else {
    res.sendStatus(400);
  }
});

// upload allowed people to take survey or exam
app.post("/upload_allowed", (req, res, next) => {
  if (
    req.query.database_unique_survey_id &&
    req.query.uid &&
    req.query.attempted
  ) {
    console.log("Upload allowed people details");
    con.connect(function (err) {
      con.query(
        `INSERT INTO happyagility.Allowed (uid, database_unique_survey_id, attempted) VALUES ('${req.query.uid}', '${req.query.database_unique_survey_id}','${req.query.attempted}')`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  }
});

app.get("/users", (req, res) => {
  con.connect(function (err) {
    con.query(
      `SELECT * FROM happyagility.users`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  });
});

// Surveys created by user
app.get("/user_surveys", authorizeUser, (req, res) => {
  con.connect(function (err) {
    con.query(
      `SELECT * FROM happyagility.surveys WHERE user_id='${req.query.user_id}'`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  });
});

// Surveys created by users on home page
app.get("/user_surveys_home", authorizeUser, (req, res) => {
  con.connect(function (err) {
    con.query(
      `SELECT survey_type, survey_name, status, database_unique_survey_id, latest_score, responses FROM happyagility.surveys use index(idx_user_id) WHERE user_id='${req.query.user_id}'`,
      function (err, result) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  });
});

// for dashboard overview graph
app.get("/fetch_for_graph", authorizeUser, (req, res) => {
  con.connect(function (err) {
    con.query(
      `SELECT answer_datetime,count(*) as total_taken FROM happyagility.answers WHERE survey_id='${req.query.survey_id}' and answer_type = 'follow_up' group by Date(answer_datetime)`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  });
});

app.get("/user_surveys_byname", authorizeUser, (req, res) => {
  con.connect(function (err) {
    con.query(
      `SELECT survey_type, survey_name, status, database_unique_survey_id, latest_score FROM happyagility.surveys WHERE user_id='${req.query.user_id}' and survey_name like '%${req.query.search_text}%'`,
      function (err, result) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  });
});

app.post("/do_nothing", (req, res) => {
  res.send("Success");
});

app.get("/survey_questions", (req, res) => {
  con.connect(function (err) {
    con.query(
      `SELECT * FROM happyagility.questions WHERE survey_id='${req.query.database_unique_survey_id}'`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  });
});
// This is to get NPS Survey Answers
app.get("/fetchNpsSurveyAnswers", authorizeUser, (req, res) => {
  con.connect(function (err) {
    con.query(
      `SELECT * FROM happyagility.answers WHERE survey_id='${req.query.survey_id}'`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  });
});

// This is to get NPS Survey Answers
app.get(
  "/fetchNpsSurveyAnswers_for_npsdash_metrics",
  authorizeUser,
  (req, res) => {
    console.log("Nps survey answer metrics request get received");
    con.connect(function (err) {
      con.query(
        `SELECT  user_id, answer_type, question_id, answer, answer1, answer2, answer3, answer4, answer5, option1, option2, option3, option4, option5, sentiment, time_taken, questionText, questionTextConv, answer_datetime FROM happyagility.answers use index(idx_survey_id) WHERE survey_id='${req.query.survey_id}'`,
        function (err, result, fields) {
          if (err) {
            res.send(err);
          }
          if (result) res.send(result);
        }
      );
    });
  }
);

// This is to get NPS Survey Answers for NPS dash overview
app.get(
  "/fetchNpsSurveyAnswers_for_npsdash_overview",
  authorizeUser,
  (req, res) => {
    con.connect(function (err) {
      var st = new Date();
      console.log("Start time", st);
      con.query(
        `SELECT user_id, answer_type, question_id, answer, answer1, answer2, answer3, answer4, answer5, option1, option2, option3, option4, option5, answer_datetime FROM happyagility.answers use index(idx_survey_id) WHERE survey_id='${req.query.survey_id}'`,
        function (err, result) {
          if (err) res.send(err);
          if (result) {
            var et = new Date();
            console.log("End time", et);
            console.log("Time taken", et - st);
            res.send(result);
          }
        }
      );
    });
  }
);

app.get("/survey_questions_by_database_question_id", (req, res) => {
  con.connect(function (err) {
    con.query(
      `SELECT * FROM happyagility.questions WHERE database_question_id='${req.query.database_question_id}'`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  });
});

// app.post('/send_mail', (req, res) => {
//     try {
//         const mailOptions = {
//           from: 'udurgesh6@gmail.com',   // This is the email address from where mail is to be sent
//           to: `${req.query.send_to}`,     // This the email address of the user who wants the service
//           subject: `${req.query.subject}`,
//           html:`
//           <!DOCTYPE html>
//             <html>
//             <head>
//             <style>
//             #main{
//             color:#091e42;
//             font-weight:bold;
//             font-size: 18px;
//             }
//             #happy{
//             color:#535b63;
//             font-size: 24px;
//             }
//             #agility{
//             font-weight:700;
//             color:#091e42;
//             font-size: 22px;
//             }
//             #image{
//             width:22px;
//             height:22px;
//             }
//             </style>
//             </head>
//             <body>
//             <p>This mail is from ${req.query.from_name}</p>
//             <p>${req.query.message}</p>

//             <p><span id="main">Powered By - </span><img id="image" src="https://happyagility.s3-us-west-2.amazonaws.com/H.jpg"/><span id="happy">appy</span><span id="agility">AGILITY</span></p>

//             </body>
//         </html>

//           `,

//         };

//         transporter.sendMail(mailOptions, function (err, info) {
//           if(err){
//             console.log("Message: Something Went Wrong")
//             res.send(err)
//           }else{
//             console.log("Test Successful");
//             res.send("Test successful")

//             con.query(`SELECT * FROM happyagility.accounts WHERE account_id='${req.query.user_id}'`,function(err, result, fields){
//                 if(err) console.log(err);
//                 if (result) {
//                     console.log(result[0].emails_used + 1)
//                     con.query(`UPDATE happyagility.accounts SET emails_used="${result[0].emails_used + 1}" where account_id="${req.query.user_id}"`, function(err, result, fields) {
//                         if (err) console.log(err);
//                         if (result) console.log(result);
//                         if (fields) console.log(fields);
//                     });
//                 }
//             })
//           }
//         })
//       }catch {
//         console.log("Something went wrong while catching")
//       }
// });

// Sending survey mail to single mail
app.post("/send_mail", (req, res, next) => {
  if (req.query.user_id && req.query.send_to) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.accounts WHERE account_id='${req.query.user_id}'`,
        function (err, result1, fields) {
          if (err) console.log(err);
          if (result1) {
            if (result1[0].emails_used + 1 <= result1[0].emails_allowed) {
              var email_list = [];
              email_list.push(req.query.send_to);
              return mailer
                .sendMail("support@happyagility.com", email_list, req.query)
                .then(() => {
                  res.send(req.query);
                  con.query(
                    `UPDATE happyagility.accounts SET emails_used=${
                      result1[0].emails_used + 1
                    } where account_id="${req.query.user_id}"`,
                    function (err, result, fields) {
                      if (err) console.log(err);
                      if (result) console.log(result);
                      if (fields) console.log(fields);
                    }
                  );
                })
                .catch(next);
            } else {
              res.send(
                `Your have reached your email quota. Kindly update for more usage.`
              );
            }
          }
        }
      );
    });
  }
});

// Sending survey mail to the group list
app.post("/send_mail_list", (req, res, next) => {
  if (req.query.user_id && req.query.group_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.contacts WHERE group_id='${req.query.group_id}'`,
        function (err, result, fields) {
          if (err) console.log(err);
          if (result) {
            var email_list = [];
            for (var i = 0; i < result.length; i++) {
              email_list.push(result[i].email);
            }
            con.query(
              `SELECT * FROM happyagility.accounts WHERE account_id='${req.query.user_id}'`,
              function (err, result1, fields) {
                if (err) console.log(err);
                if (result1) {
                  if (
                    result1[0].emails_used + email_list.length <=
                    result1[0].emails_allowed
                  ) {
                    return mailer
                      .sendMail(
                        "support@happyagility.com",
                        email_list,
                        req.query
                      )
                      .then(() => {
                        res.send(req.query);
                        con.query(
                          `UPDATE happyagility.accounts SET emails_used=${
                            result1[0].emails_used + email_list.length
                          } where account_id="${req.query.user_id}"`,
                          function (err, result, fields) {
                            if (err) console.log(err);
                            if (result) console.log(result);
                            if (fields) console.log(fields);
                          }
                        );
                      })
                      .catch(next);
                  } else {
                    res.send(
                      `Your emails quota used is ${result1[0].emails_used} and allowed quota is ${result1[0].emails_allowed} whereas the group asked for has members(${email_list.length}) greater than the remaining capacity, hence cannot be sent. Kindly choose group which has less members or update to paid package.`
                    );
                  }
                }
              }
            );
          }
        }
      );
    });
  }
});

// Give capacity usage at the end of every month on 28th
const job = new CronJob("23 09 16 * *", () => {
  console.log("Working");
  con.query(
    `SELECT * FROM happyagility.accounts`,
    function (err, result, fields) {
      if (err) console.log(err);
      if (result) {
        for (var i = 0; i < result.length; i++) {
          var mail_list = [];
          mail_list.push(result[i].user_email);
          console.log(mail_list);
          capacityMailer
            .sendMail("support@happyagility.com", mail_list, result[i])
            .then(() => {
              console.log(`Sent to !!!`);
            });
        }
      }
    }
  );
});
job.start();

// To reset the capacity used to default on 28th of every month
const job1 = new CronJob("59 23 28 * *", () => {
  con.connect(function (err) {
    con.query(
      `UPDATE happyagility.accounts SET emails_used=${0}, responses_got=${0}, survey_used=${0}`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  });
});
job1.start();

// Integrations Related

// Text Analytcis
app.post("/text_analytics", (req, res) => {
  const params = {
    LanguageCode: "en",
    Text: req.query.text,
  };
  comprehend.detectSentiment(params, function (err, data) {
    if (err) console.log(err, err.stack);
    else {
      res.send(data);
    }
  });
});

// CSV Analytics
app.post("/csv_analytics", (req, res) => {
  // console.log(req.query.csv)
  var csvData = req.query.csv.split(",");
  const params = {
    LanguageCode: "en",
    TextList: csvData,
  };
  comprehend.batchDetectSentiment(params, function (err, data) {
    if (err) console.log(err, err.stack);
    else {
      res.send(data);
    }
  });
});

// Get keywords for trustpilot
app.get("/get_trustpilot_keywords", (req, res) => {
  console.log("Trustpilot Keywords details request received");
  if (req.query.user_trustpilot_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.trustpilotKeywords where user_trustpiot_id='${req.query.user_trustpilot_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_trustpilot_id Id Not Present !!!");
  }
});

// Search trustpilot keywords in trustpilotSc
app.get("/search_keyword_trustpilot", (req, res) => {
  console.log("Trustpilot Keyword search request received");
  if (req.query.user_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.trustpilotSc where user_id='${req.query.user_id}' and Body like '%${req.query.word}%'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User trustpilot Id or word Not Present !!!");
  }
});

// Get Statments for trustpilot
app.get("/get_trustpilot_statements", (req, res) => {
  console.log("Trustpilot statements details request received");
  if (req.query.user_trustpilot_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.trustpilotStatements where user_trustpiot_id='${req.query.user_trustpilot_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_trustpilot_id Id Not Present !!!");
  }
});

// Get keywords for playstore
app.get("/get_playstore_keywords", (req, res) => {
  console.log("Playstore Keywords details request received");
  if (req.query.user_gpsc_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.googlePlaystoreKeywords where user_gpsc_id='${req.query.user_gpsc_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_gpsc_id Id Not Present !!!");
  }
});

// Get keywords for Zendesk
app.get("/get_zendesk_keywords", (req, res) => {
  console.log("Zendesk Keywords details request received");
  if (req.query.user_zen_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.zendeskKeywords where user_zen_id='${req.query.user_zen_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_zen_id Id Not Present !!!");
  }
});

// Get keywords for Freshdesk
app.get("/get_freshdesk_keywords", (req, res) => {
  console.log("Freshdesk Keywords details request received");
  if (req.query.user_fresh_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.freshKeywords where user_fresh_id='${req.query.user_fresh_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_fresh_id Id Not Present !!!");
  }
});

// Get keywords for Hubspot
app.get("/get_hubspot_keywords", (req, res) => {
  console.log("Hubspot Keywords details request received");
  if (req.query.user_gpsc_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.hubKeywords where user_hub_id='${req.query.user_hub_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_hub_id Id Not Present !!!");
  }
});

// Search Playstore keywords in googlePlayStoreSc
app.get("/search_keyword_playstore", (req, res) => {
  console.log("Playstore Keyword search request received");
  if (req.query.user_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.googlePlaystoreSc where user_id='${req.query.user_id}' and Body like '%${req.query.word}%'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User Playstore Id or word Not Present !!!");
  }
});

// Search Zendesk keywords in zendeskSc
app.get("/search_keyword_zendesk", (req, res) => {
  console.log("Zendesk Keyword search request received");
  if (req.query.user_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.zendeskSc where user_id='${req.query.user_id}' and Body like '%${req.query.word}%'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User Zendesk Id or word Not Present !!!");
  }
});

// Search Freshdesk keywords in freshSc
app.get("/search_keyword_freshdesk", (req, res) => {
  console.log("Freshdesk Keyword search request received");
  if (req.query.user_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.freshSc where user_id='${req.query.user_id}' and Body like '%${req.query.word}%'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User freshdesk Id or word Not Present !!!");
  }
});

// Search Hubspot keywords in hubSc
app.get("/search_keyword_hubspot", (req, res) => {
  console.log("Hubspot Keyword search request received");
  if (req.query.user_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.hubSc where user_id='${req.query.user_id}' and Body like '%${req.query.word}%'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User Hubspot Id or word Not Present !!!");
  }
});

// Get Statements for Playstore
app.get("/get_playstore_statements", (req, res) => {
  console.log("Playstore statements details request received");
  if (req.query.user_gpsc_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.googlePlaystoreStatements where user_gpsc_id='${req.query.user_gpsc_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_gpsc_id Id Not Present !!!");
  }
});
// Get Statements for Playstore
app.get("/get_zendesk_statements", (req, res) => {
  console.log("Zendesk statements details request received");
  if (req.query.user_zen_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.zendeskStatements where user_zen_id='${req.query.user_zen_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_zen_id Id Not Present !!!");
  }
}); // Get Statements for Freshdesk
app.get("/get_freshdesk_statements", (req, res) => {
  console.log("Freshdesk statements details request received");
  if (req.query.user_fresh_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.freshdeskStatements where user_fresh_id='${req.query.user_fresh_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_fresh_id Id Not Present !!!");
  }
}); // Get Statements for Hubspot
app.get("/get_hubspot_statements", (req, res) => {
  console.log("Hubspot statements details request received");
  if (req.query.user_hub_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.hubStatements where user_hub_id='${req.query.user_hub_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_hub_id Id Not Present !!!");
  }
});

// Get Statements for surveys
app.get("/get_survey_statements", authorizeUser, (req, res) => {
  console.log("Survey statements details request received");
  if (req.query.survey_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.statements where survey_id='${req.query.survey_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("survey_id Id Not Present !!!");
  }
});

// Get keywords for youtube
app.get("/get_youtube_keywords", (req, res) => {
  console.log("Youtube Keywords details request received");
  if (req.query.user_ytsc_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.youtubeKeywords where user_ytsc_id='${req.query.user_ytsc_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_ytsc_id Id Not Present !!!");
  }
});

// Get keywords for youtube TS
app.get("/get_youtube_ts_keywords", (req, res) => {
  console.log(
    "Youtube ts Keywords details request received",
    req.query.user_ytsc_id
  );
  if (req.query.user_ytsc_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.youtubeTsKeywords where user_ytsc_id='${req.query.user_ytsc_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) {
            console.log(result);
            res.send(result);
          }
        }
      );
    });
  } else {
    console.log("user_ytsc_id Id Not Present !!!");
  }
});

// Get keywords for Amazon TS
app.get("/get_amazon_keywords", authorizeUser, (req, res) => {
  console.log(
    "Amazon Keywords details request received",
    req.query.user_azsc_id
  );
  if (req.query.user_azsc_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.amazonKeywords where user_azsc_id='${req.query.user_azsc_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) {
            console.log(result);
            res.send(result);
          }
        }
      );
    });
  } else {
    console.log("user_azsc_id Id Not Present !!!");
  }
});

// Search Youtube keywords in googlePlayStoreSc
app.get("/search_keyword_youtube", (req, res) => {
  console.log("Youtube Keyword search request received");
  if (req.query.user_id && req.query.word) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.youtubeSc where user_id='${req.query.user_id}' and Body like '%${req.query.word}%'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User Youtube Id or word Not Present !!!");
  }
});
// Search Youtube ts keywords in googlePlayStoreSc
app.get("/search_keyword_ts_youtube", (req, res) => {
  if (req.query.user_id && req.query.word) {
    console.log("Youtube ts Keyword search request received", req.query.word);
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.youtubeTranscriptSc where user_id='${req.query.user_id}' and Body like '%${req.query.word}%' and user_ytsc_id='${req.query.user_ytsc_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User Youtube Id or word Not Present !!!");
  }
});
// Search Amazon keywords in googlePlayStoreSc
app.get("/search_keyword_amazon", authorizeUser, (req, res) => {
  if (req.query.user_id && req.query.word) {
    console.log("Amazon Keyword search request received", req.query.word);
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.amazonReviewsSc where user_id='${req.query.user_id}' and Body like '%${req.query.word}%' and user_azsc_id='${req.query.user_azsc_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    res.send({ status: 400 });
  }
});
// Get Statements for Youtube
app.get("/get_youtube_statements", (req, res) => {
  console.log("Youtube statements details request received");
  if (req.query.user_ytsc_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.youtubeStatements where user_ytsc_id='${req.query.user_ytsc_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_ytsc_id Id Not Present !!!");
  }
});

// Get Statements for Youtube Ts
app.get("/get_youtube_ts_statements", (req, res) => {
  console.log("Youtube TS statements details request received");
  if (req.query.user_ytsc_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.youtubeTsStatements where user_ytsc_id='${req.query.user_ytsc_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_ytsc_id Id Not Present !!!");
  }
});

// Get Statements for Amazon
app.get("/get_amazon_statements", authorizeUser, (req, res) => {
  console.log("Amazon statements details request received");
  if (req.query.user_azsc_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.amazonStatements where user_azsc_id='${req.query.user_azsc_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_azsc_id Id Not Present !!!");
  }
});

//Testing
// con.connect(function (err) {
//       con.query(
//             `SELECT * FROM happyagility.answers WHERE (answer_type="Textbox" or answer_type="follow_up") and sentiment="Not Generated"`,
//             function (err, resultSelect, fields) {
//                   if (err) console.log(err);
//                   if (resultSelect) {
//                         resultSelect.forEach((rs) => {
//                               if (rs.answer.length > 0) {
//                                     const params = {
//                                           LanguageCode: "en",
//                                           Text: rs.answer,
//                                     };
//                                     comprehend.detectSentiment(
//                                           params,
//                                           function (err, data) {
//                                                 if (err)
//                                                       console.log(
//                                                             err,
//                                                             err.stack
//                                                       );
//                                                 else {
//                                                       con.query(
//                                                             `UPDATE happyagility.answers SET sentiment='${data.Sentiment}' where answer_id=${rs.answer_id}`,
//                                                             function (
//                                                                   err,
//                                                                   result,
//                                                                   fields
//                                                             ) {
//                                                                   if (err)
//                                                                         console.log(
//                                                                               err
//                                                                         );
//                                                                   if (result)
//                                                                         console.log(
//                                                                               result
//                                                                         );
//                                                             }
//                                                       );
//                                                 }
//                                           }
//                                     );
//                               } else {
//                                     con.query(
//                                           `UPDATE happyagility.answers SET sentiment=${"Empty"} where answer_id=${
//                                                 rs.answer_id
//                                           }`,
//                                           function (err, result, fields) {
//                                                 if (err) console.log(err);
//                                                 if (result) console.log(result);
//                                           }
//                                     );
//                               }
//                         });
//                   }
//             }
//       );
// });

// app.get("/trustpilot", function (req, res) {

// We are trying to run a full fledge trustpilot programs of scrapping, sentiment generation and keywords and statements generation from here
// console.log("Hi trustpilot is working now");
// con.connect(function (err) {
//       con.query(
//             `Select * from  happyagility.trustpilotRequest`, // Getting all the requests for trustpilot
//             function (err, result, fields) {
//                   if (err) console.log(err);
//                   if (result) {
//                         // Going through each row details
//                         result.forEach((r) => {
//                               console.log(
//                                     "User_id: ",
//                                     r.user_id,
//                                     "Website: ",
//                                     r.website
//                               );
//                               // Calling ML Trustpilot api to scrape the data by sending the website details
//                               request(
//                                     `http://192.168.0.109:5000/trustpilot?url=${r.website}&user_id=${r.user_id}`,
//                                     function (error, response, body) {
//                                           // console.error("error:", error); // Print the error

//                                           // Check if new scrapped data is available
//                                           // here its not available
//                                           if (
//                                                 error === null &&
//                                                 body ==
//                                                       "Latest data already pushed"
//                                           ) {
//                                                 console.log("Print null");
//                                           }
//                                           // here its available
//                                           else if (
//                                                 error === null &&
//                                                 body == "Recent Changes Updated"
//                                           ) {
//                                                 console.log(
//                                                       "We need to run the program here for sentiment as well as keywords and statements"
//                                                 );
//                                                 // Going ahead and generating the sentiments for scrapped data which are newly available and for which sentiment is
//                                                 // not generated
//                                                 con.connect(function (err) {
//                                                       con.query(
//                                                             `SELECT * FROM happyagility.trustpilotSc WHERE sentiments="Not Generated"`,
//                                                             function (
//                                                                   err,
//                                                                   resultSelect,
//                                                                   fields
//                                                             ) {
//                                                                   if (err)
//                                                                         console.log(
//                                                                               err
//                                                                         );
//                                                                   if (
//                                                                         resultSelect
//                                                                   ) {
//                                                                         var lengthOfResultSelect = 0;
//                                                                         resultSelect.forEach(
//                                                                               (
//                                                                                     rs
//                                                                               ) => {
//                                                                                     if (
//                                                                                           rs
//                                                                                                 .Body
//                                                                                                 .length >
//                                                                                           0
//                                                                                     ) {
//                                                                                           const params =
//                                                                                                 {
//                                                                                                       LanguageCode:
//                                                                                                             "en",
//                                                                                                       Text: rs.Body,
//                                                                                                 };
//                                                                                           comprehend.detectSentiment(
//                                                                                                 params,
//                                                                                                 function (
//                                                                                                       err,
//                                                                                                       data
//                                                                                                 ) {
//                                                                                                       if (
//                                                                                                             err
//                                                                                                       )
//                                                                                                             console.log(
//                                                                                                                   err,
//                                                                                                                   err.stack
//                                                                                                             );
//                                                                                                       else {
//                                                                                                             con.query(
//                                                                                                                   `UPDATE happyagility.trustpilotSc SET sentiments='${data.Sentiment}' where trustpilotsc_id=${rs.trustpilotsc_id}`,
//                                                                                                                   function (
//                                                                                                                         err,
//                                                                                                                         result,
//                                                                                                                         fields
//                                                                                                                   ) {
//                                                                                                                         if (
//                                                                                                                               err
//                                                                                                                         ) {
//                                                                                                                               console.log(
//                                                                                                                                     err
//                                                                                                                               );
//                                                                                                                               lengthOfResultSelect += 1;
//                                                                                                                               if (
//                                                                                                                                     lengthOfResultSelect ===
//                                                                                                                                     resultSelect.length
//                                                                                                                               ) {
//                                                                                                                                     console.log(
//                                                                                                                                           "Yes finally"
//                                                                                                                                     );
//                                                                                                                                     request(
//                                                                                                                                           `http://192.168.0.109:5000/trustpilot_keywordsgen?url=${r.website}`,
//                                                                                                                                           function (
//                                                                                                                                                 error,
//                                                                                                                                                 response,
//                                                                                                                                                 body
//                                                                                                                                           ) {
//                                                                                                                                                 console.log(
//                                                                                                                                                       body
//                                                                                                                                                 );
//                                                                                                                                           }
//                                                                                                                                     );
//                                                                                                                               }
//                                                                                                                         }

//                                                                                                                         if (
//                                                                                                                               result
//                                                                                                                         ) {
//                                                                                                                               console.log(
//                                                                                                                                     result
//                                                                                                                               );
//                                                                                                                               lengthOfResultSelect += 1;
//                                                                                                                               if (
//                                                                                                                                     lengthOfResultSelect ===
//                                                                                                                                     resultSelect.length
//                                                                                                                               ) {
//                                                                                                                                     console.log(
//                                                                                                                                           "Yes finally"
//                                                                                                                                     );
//                                                                                                                                     request(
//                                                                                                                                           `http://192.168.0.109:5000/trustpilot_keywordsgen?url=${r.website}`,
//                                                                                                                                           function (
//                                                                                                                                                 error,
//                                                                                                                                                 response,
//                                                                                                                                                 body
//                                                                                                                                           ) {
//                                                                                                                                                 console.log(
//                                                                                                                                                       body
//                                                                                                                                                 );
//                                                                                                                                           }
//                                                                                                                                     );
//                                                                                                                               }
//                                                                                                                         }
//                                                                                                                   }
//                                                                                                             );
//                                                                                                             // console.log(
//                                                                                                             //       "Successfully updated for ",
//                                                                                                             //       rs.trustpilotsc_id
//                                                                                                             // );
//                                                                                                       }
//                                                                                                 }
//                                                                                           );
//                                                                                     } else {
//                                                                                           con.query(
//                                                                                                 `UPDATE happyagility.trustpilotSc SET sentiments=${"Empty"} where trustpilotsc_id=${
//                                                                                                       rs.trustpilotsc_id
//                                                                                                 }`,
//                                                                                                 function (
//                                                                                                       err,
//                                                                                                       result,
//                                                                                                       fields
//                                                                                                 ) {
//                                                                                                       if (
//                                                                                                             err
//                                                                                                       ) {
//                                                                                                             console.log(
//                                                                                                                   err
//                                                                                                             );
//                                                                                                             lengthOfResultSelect += 1;
//                                                                                                             if (
//                                                                                                                   lengthOfResultSelect ===
//                                                                                                                   resultSelect.length
//                                                                                                             ) {
//                                                                                                                   console.log(
//                                                                                                                         "Yes finally"
//                                                                                                                   );
//                                                                                                                   request(
//                                                                                                                         `http://192.168.0.109:5000/trustpilot_keywordsgen?url=${r.website}`,
//                                                                                                                         function (
//                                                                                                                               error,
//                                                                                                                               response,
//                                                                                                                               body
//                                                                                                                         ) {
//                                                                                                                               console.log(
//                                                                                                                                     body
//                                                                                                                               );
//                                                                                                                         }
//                                                                                                                   );
//                                                                                                             }
//                                                                                                       }

//                                                                                                       if (
//                                                                                                             result
//                                                                                                       ) {
//                                                                                                             console.log(
//                                                                                                                   result
//                                                                                                             );
//                                                                                                             lengthOfResultSelect += 1;
//                                                                                                             if (
//                                                                                                                   lengthOfResultSelect ===
//                                                                                                                   resultSelect.length
//                                                                                                             ) {
//                                                                                                                   console.log(
//                                                                                                                         "Yes finally"
//                                                                                                                   );
//                                                                                                                   request(
//                                                                                                                         `http://192.168.0.109:5000/trustpilot_keywordsgen?url=${r.website}`,
//                                                                                                                         function (
//                                                                                                                               error,
//                                                                                                                               response,
//                                                                                                                               body
//                                                                                                                         ) {
//                                                                                                                               console.log(
//                                                                                                                                     body
//                                                                                                                               );
//                                                                                                                         }
//                                                                                                                   );
//                                                                                                             }
//                                                                                                       }
//                                                                                                 }
//                                                                                           );
//                                                                                     }
//                                                                               }
//                                                                         );
//                                                                         console.log(
//                                                                               "Okay"
//                                                                         );
//                                                                   }
//                                                             }
//                                                       );
//                                                 });

//                                           }
//                                           // here something is wrong
//                                           else {
//                                                 console.log(
//                                                       "Something went wrong"
//                                                 );
//                                           }
//                                           // Print the response status code if a response was received
//                                           console.log("body:", body); // Print the data received
//                                           // res.send(body); //Display the response on the website
//                                     }
//                               );
//                         });
//                   }
//             }
//       );
// });

// Program for Google Playstore
// console.log("Hi GooglePlaystore Program is working now");
// con.connect(function (err) {
//   con.query(
//     `Select * from  happyagility.googlePlaystoreRequest`, // Getting all the requests for trustpilot
//     function (err, result, fields) {
//       if (err) console.log(err);
//       if (result) {
//         // Going through each row details
//         result.forEach((r) => {
//           console.log("User_id: ", r.user_id, "Website: ", r.website);
//           // Calling ML Trustpilot api to scrape the data by sending the website details
//           request(
//             `http://192.168.0.109:5000/googlePlaystore?url=${r.website}&user_id=${r.user_id}`,
//             function (error, response, body) {
//               // console.error("error:", error); // Print the error

//               // Check if new scrapped data is available
//               // here its not available
//               if (error === null && body == "Latest Data Already Pushed") {
//                 console.log("Print null");
//               }
//               // here its available
//               else if (error === null && body == "Recent Data Pushed") {
//                 console.log(
//                   "We need to run the program here for sentiment as well as keywords and statements"
//                 );
//                 // Going ahead and generating the sentiments for scrapped data which are newly available and for which sentiment is
//                 // not generated
//                 con.connect(function (err) {
//                   con.query(
//                     `SELECT * FROM happyagility.googlePlaystoreSc WHERE sentiments="Not Generated"`,
//                     function (err, resultSelect, fields) {
//                       if (err) console.log(err);
//                       if (resultSelect) {
//                         var lengthOfResultSelect = 0;
//                         resultSelect.forEach((rs) => {
//                           if (rs.Body.length > 0) {
//                             const params = {
//                               LanguageCode: "en",
//                               Text: rs.Body,
//                             };
//                             comprehend.detectSentiment(
//                               params,
//                               function (err, data) {
//                                 if (err) console.log(err, err.stack);
//                                 else {
//                                   con.query(
//                                     `UPDATE happyagility.googlePlaystoreSc SET sentiments='${data.Sentiment}' where gpsc_id=${rs.gpsc_id}`,
//                                     function (err, result, fields) {
//                                       if (err) {
//                                         console.log(err);
//                                         lengthOfResultSelect += 1;
//                                         if (
//                                           lengthOfResultSelect ===
//                                           resultSelect.length
//                                         ) {
//                                           console.log("Yes finally");
//                                           request(
//                                             `http://192.168.0.109:5000/googlePlaystore_keywordsgen?url=${r.website}`,
//                                             function (error, response, body) {
//                                               console.log(body);
//                                             }
//                                           );
//                                         }
//                                       }

//                                       if (result) {
//                                         console.log(result);
//                                         lengthOfResultSelect += 1;
//                                         if (
//                                           lengthOfResultSelect ===
//                                           resultSelect.length
//                                         ) {
//                                           console.log("Yes finally");
//                                           request(
//                                             `http://192.168.0.109:5000/googlePlaystore_keywordsgen?url=${r.website}`,
//                                             function (error, response, body) {
//                                               console.log(body);
//                                             }
//                                           );
//                                         }
//                                       }
//                                     }
//                                   );
//                                   // console.log(
//                                   //       "Successfully updated for ",
//                                   //       rs.trustpilotsc_id
//                                   // );
//                                 }
//                               }
//                             );
//                           } else {
//                             con.query(
//                               `UPDATE happyagility.googlePlaystoreSc SET sentiments=${"Empty"} where gpsc_id=${
//                                 rs.trustpilotsc_id
//                               }`,
//                               function (err, result, fields) {
//                                 if (err) {
//                                   console.log(err);
//                                   lengthOfResultSelect += 1;
//                                   if (
//                                     lengthOfResultSelect === resultSelect.length
//                                   ) {
//                                     console.log("Yes finally");
//                                     request(
//                                       `http://192.168.0.109:5000/googlePlaystore_keywordsgen?url=${r.website}`,
//                                       function (error, response, body) {
//                                         console.log(body);
//                                       }
//                                     );
//                                   }
//                                 }

//                                 if (result) {
//                                   console.log(result);
//                                   lengthOfResultSelect += 1;
//                                   if (
//                                     lengthOfResultSelect === resultSelect.length
//                                   ) {
//                                     console.log("Yes finally");
//                                     request(
//                                       `http://192.168.0.109:5000/googlePlaystore_keywordsgen?url=${r.website}`,
//                                       function (error, response, body) {
//                                         console.log(body);
//                                       }
//                                     );
//                                   }
//                                 }
//                               }
//                             );
//                           }
//                         });
//                         console.log("Okay");
//                       }
//                     }
//                   );
//                 });
//               }
//               // here something is wrong
//               else {
//                 console.log("Something went wrong");
//               }
//               // Print the response status code if a response was received
//               console.log("body:", body); // Print the data received
//               // res.send(body); //Display the response on the website
//             }
//           );
//         });
//       }
//     }
//   );
// });

// Program for Youtube
// console.log("Hi Youtube Program is working now");
// con.connect(function (err) {
//   con.query(
//     `Select * from  happyagility.youtubeRequest`, // Getting all the requests for trustpilot
//     function (err, result, fields) {
//       if (err) console.log(err);
//       if (result) {
//         // Going through each row details
//         result.forEach((r) => {
//           console.log("User_id: ", r.user_id, "Website: ", r.website);
//           // Calling ML Trustpilot api to scrape the data by sending the website details
//           request(
//             `http://192.168.0.109:5000/youtube?url=${r.website}&user_id=${r.user_id}`,
//             function (error, response, body) {
//               // console.error("error:", error); // Print the error

//               // Check if new scrapped data is available
//               // here its not available
//               if (error === null && body == "Latest Data Already Pushed") {
//                 console.log("Print null");
//               }
//               // here its available
//               else if (error === null && body == "Recent Data Pushed") {
//                 console.log(
//                   "We need to run the program here for sentiment as well as keywords and statements"
//                 );
//                 // Going ahead and generating the sentiments for scrapped data which are newly available and for which sentiment is
//                 // not generated
//                 con.connect(function (err) {
//                   con.query(
//                     `SELECT * FROM happyagility.youtubeSc WHERE sentiments="Not Generated"`,
//                     function (err, resultSelect, fields) {
//                       if (err) console.log(err);
//                       if (resultSelect) {
//                         var lengthOfResultSelect = 0;
//                         resultSelect.forEach((rs) => {
//                           if (rs.Body.length > 0) {
//                             const params = {
//                               LanguageCode: "en",
//                               Text: rs.Body,
//                             };
//                             comprehend.detectSentiment(
//                               params,
//                               function (err, data) {
//                                 if (err) console.log(err, err.stack);
//                                 else {
//                                   con.query(
//                                     `UPDATE happyagility.youtubeSc SET sentiments='${data.Sentiment}' where youtubesc_id=${rs.youtubesc_id}`,
//                                     function (err, result, fields) {
//                                       if (err) {
//                                         console.log(err);
//                                         lengthOfResultSelect += 1;
//                                         if (
//                                           lengthOfResultSelect ===
//                                           resultSelect.length
//                                         ) {
//                                           console.log("Yes finally");
//                                           request(
//                                             `http://192.168.0.109:5000/youtube_keywordsgen?url=${r.website}`,
//                                             function (error, response, body) {
//                                               console.log(body);
//                                             }
//                                           );
//                                         }
//                                       }

//                                       if (result) {
//                                         console.log(result);
//                                         lengthOfResultSelect += 1;
//                                         if (
//                                           lengthOfResultSelect ===
//                                           resultSelect.length
//                                         ) {
//                                           console.log("Yes finally");
//                                           request(
//                                             `http://192.168.0.109:5000/youtube_keywordsgen?url=${r.website}`,
//                                             function (error, response, body) {
//                                               console.log(body);
//                                             }
//                                           );
//                                         }
//                                       }
//                                     }
//                                   );
//                                 }
//                               }
//                             );
//                           } else {
//                             con.query(
//                               `UPDATE happyagility.youtubeSc SET sentiments=${"Empty"} where youtubesc_id=${
//                                 rs.youtubesc_id
//                               }`,
//                               function (err, result, fields) {
//                                 if (err) {
//                                   console.log(err);
//                                   lengthOfResultSelect += 1;
//                                   if (
//                                     lengthOfResultSelect === resultSelect.length
//                                   ) {
//                                     console.log("Yes finally");
//                                     request(
//                                       `http://192.168.0.109:5000/youtube_keywordsgen?url=${r.website}`,
//                                       function (error, response, body) {
//                                         console.log(body);
//                                       }
//                                     );
//                                   }
//                                 }

//                                 if (result) {
//                                   console.log(result);
//                                   lengthOfResultSelect += 1;
//                                   if (
//                                     lengthOfResultSelect === resultSelect.length
//                                   ) {
//                                     console.log("Yes finally");
//                                     request(
//                                       `http://192.168.0.109:5000/youtube_keywordsgen?url=${r.website}`,
//                                       function (error, response, body) {
//                                         console.log(body);
//                                       }
//                                     );
//                                   }
//                                 }
//                               }
//                             );
//                           }
//                         });
//                         console.log("Okay");
//                       }
//                     }
//                   );
//                 });
//               }
//               // here something is wrong
//               else {
//                 console.log("Something went wrong");
//               }
//               // Print the response status code if a response was received
//               console.log("body:", body); // Print the data received
//               // res.send(body); //Display the response on the website
//             }
//           );
//         });
//       }
//     }
//   );
// });

// con.connect(function (err) {
//       con.query(
//             `SELECT * FROM happyagility.trustpilotSc WHERE sentiments="Not Generated"`,
//             function (err, resultSelect, fields) {
//                   if (err) console.log(err);
//                   if (resultSelect) {
//                         resultSelect.forEach((rs) => {
//                               if (rs.Body.length > 0) {
//                                     const params = {
//                                           LanguageCode: "en",
//                                           Text: rs.Body,
//                                     };
//                                     comprehend.detectSentiment(
//                                           params,
//                                           function (err, data) {
//                                                 if (err)
//                                                       console.log(
//                                                             err,
//                                                             err.stack
//                                                       );
//                                                 else {
//                                                       con.query(
//                                                             `UPDATE happyagility.trustpilotSc SET sentiments='${data.Sentiment}' where trustpilotsc_id=${rs.trustpilotsc_id}`,
//                                                             function (
//                                                                   err,
//                                                                   result,
//                                                                   fields
//                                                             ) {
//                                                                   if (err)
//                                                                         console.log(
//                                                                               err
//                                                                         );
//                                                                   if (
//                                                                         result
//                                                                   )
//                                                                         console.log(
//                                                                               result
//                                                                         );
//                                                             }
//                                                       );
//                                                       console.log(
//                                                             "Successfully updated for ",
//                                                             rs.trustpilotsc_id
//                                                       );
//                                                 }
//                                           }
//                                     );
//                               } else {
//                                     con.query(
//                                           `UPDATE happyagility.trustpilotSc SET sentiments=${"Empty"} where trustpilotsc_id=${
//                                                 rs.trustpilotsc_id
//                                           }`,
//                                           function (err, result, fields) {
//                                                 if (err) console.log(err);
//                                                 if (result)
//                                                       console.log(result);
//                                           }
//                                     );
//                               }
//                         });
//                   }
//             }
//       );
// });
// request(
//       "https://python-ha.herokuapp.com/",
//       function (error, response, body) {
//             console.error("error:", error); // Print the error
//             console.log("statusCode:", response && response.statusCode); // Print the response status code if a response was received
//             console.log("body:", body); // Print the data received
//             res.send(body); //Display the response on the website
//       }
// );
// });

//Get the trell details
app.get("/get_trello_details", (req, res) => {
  console.log("Trello Details request received");
  if (req.query.user_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.actionItems where user_id='${req.query.user_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) {
            if (result.length > 0) {
              con.connect(function (err) {
                con.query(
                  `SELECT * FROM happyagility.actionItems where trello_id='${result[0].trello_id}'`,
                  function (err, result, fields) {
                    if (err) res.send(err);
                    if (result) {
                      res.send(result);
                    }
                  }
                );
              });
            } else {
              con.connect(function (err) {
                con.query(
                  `SELECT * FROM happyagility.actionItems where major_group_id='1'`,
                  function (err, result, fields) {
                    if (err) res.send(err);
                    if (result) {
                      res.send(result);
                    }
                  }
                );
              });
            }
          }
        }
      );
    });
  } else {
    console.log("No user id present");
  }
});

// Post the trello detail for first time in order to create
app.post("/push_trello_detail", (req, res) => {
  if (req.query.user_id) {
    console.log("Push trello detail request received");
    con.connect(function (err) {
      con.query(
        `INSERT INTO happyagility.actionItems (user_id, major_group_name, task_name, task_description, participants, major_group_id, task_id, trello_id, trello_name, created_date, priority) VALUES('${req.query.user_id}', '${req.query.major_group_name}', '${req.query.task_name}', '${req.query.task_description}', '${req.query.assigned}', '${req.query.major_group_id}', '${req.query.task_id}', '${req.query.trello_id}', '${req.query.trello_name}', '${req.query.created_date}', '${req.query.priority}')`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("User Id Missing");
  }
});

// Update the trello task name
app.post("/update_trello_task_name", (req, res) => {
  if (req.query.task_id && req.query.major_group_id) {
    console.log("Update trello task name request received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.actionItems SET task_name="${req.query.task_name}" where task_id="${req.query.task_id}" and major_group_id="${req.query.major_group_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("Task Id or Major Group Id Missing");
  }
});

// Update the trello task name
app.post("/update_trello_task_description", (req, res) => {
  if (req.query.task_id && req.query.major_group_id) {
    console.log("Update trello task description request received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.actionItems SET task_description="${req.query.task_description}" where task_id="${req.query.task_id}" and major_group_id="${req.query.major_group_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("Task Id or Major Group Id Missing");
  }
});

// Update the trello task date
app.post("/update_trello_task_date", (req, res) => {
  if (req.query.task_id && req.query.major_group_id) {
    console.log("Update trello task date request received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.actionItems SET due_date="${req.query.due_date}" where task_id="${req.query.task_id}" and major_group_id="${req.query.major_group_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("Task Id or Major Group Id Missing");
  }
});

// Update the trello task assignes
app.post("/update_trello_task_assignes", (req, res) => {
  if (req.query.task_id && req.query.major_group_id) {
    console.log("Update trello task assignes request received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.actionItems SET participants="${req.query.participants}" where task_id="${req.query.task_id}" and major_group_id="${req.query.major_group_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("Task Id or Major Group Id Missing");
  }
});

// Update the trello group name
app.post("/update_trello_group_name", (req, res) => {
  if (req.query.major_group_id) {
    console.log("Update trello group name request received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.actionItems SET major_group_name="${req.query.major_group_name}" where major_group_id="${req.query.major_group_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("Task Id or Major Group Id Missing");
  }
});
//update_trello_name
app.post("/update_trello_name", (req, res) => {
  if (req.query.trello_id) {
    console.log("Update trello name request received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.actionItems SET trello_name="${req.query.trello_name}" where trello_id="${req.query.trello_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("Trello_id  Missing");
  }
});

//update_trello_priority
app.post("/update_trello_priority", (req, res) => {
  if (req.query.trello_id) {
    console.log("Update trello priority request received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.actionItems SET priority="${req.query.priority}" where trello_id="${req.query.trello_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("Priority  Missing");
  }
});

// con.connect(function (err) {
//       con.query(
//         `SELECT * FROM happyagility.actionItems where user_id='${req.query.user_id}'`,
//         function (err, result, fields) {
//           if (err) res.send(err);
//           if (result) {

app.get("/get_trello_list", (req, res) => {
  console.log("Trello List request received");
  if (req.query.user_id) {
    con.connect(function (err) {
      con.query(
        `SELECT Distinct trello_name,trello_id FROM happyagility.actionItems where user_id='${req.query.user_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User_id not found");
  }
});

app.get("/get_trello_detail_onselect", (req, res) => {
  console.log("Trello Detail on select request received");
  if (req.query.trello_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.actionItems where trello_id='${req.query.trello_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("Trello_id not found");
  }
});

app.post("/send_trello_update", (req, res) => {
  var email_list = req.query.participants.split(",");
  console.log("Send trello update");
  return trelloMail
    .sendMail("support@happyagility.com", email_list, req.query)
    .then(() => {
      console.log("Trello update mail sent");
      res.send("Trello update mails sent");
    });
  // .catch(next);
});

// Zendesk
// con.query(
//   `SELECT * FROM happyagility.zendeskSc WHERE sentiments="Not Generated"`,
//   function (err, resultSelect, fields) {
//     if (err) console.log(err);
//     if (resultSelect) {
//       resultSelect.forEach((rs) => {
//         if (rs.Body.length > 0) {
//           const params = {
//             LanguageCode: "en",
//             Text: rs.Body,
//           };
//           comprehend.detectSentiment(params, function (err, data) {
//             if (err) console.log(err, err.stack);
//             else {
//               con.query(
//                 `UPDATE happyagility.zendeskSc SET sentiments='${data.Sentiment}' where zendesk_id=${rs.zendesk_id}`,
//                 function (err, result, fields) {
//                   if (err) console.log(err);
//                   if (result) console.log(result);
//                 }
//               );
//               console.log("Successfully updated for ", rs.zendesk_id);
//             }
//           });
//         } else {
//           con.query(
//             `UPDATE happyagility.zendeskSc SET sentiments=${"Empty"} where zendesk_id=${
//               rs.zendesk_id
//             }`,
//             function (err, result, fields) {
//               if (err) console.log(err);
//               if (result) console.log(result);
//             }
//           );
//         }
//       });
//     }
//   }
// );

// Freshdesk
// con.query(
//   `SELECT * FROM happyagility.freshSc WHERE sentiments="Not Generated"`,
//   function (err, resultSelect, fields) {
//     if (err) console.log(err);
//     if (resultSelect) {
//       resultSelect.forEach((rs) => {
//         if (rs.Body.length > 0) {
//           const params = {
//             LanguageCode: "en",
//             Text: rs.Body,
//           };
//           comprehend.detectSentiment(params, function (err, data) {
//             if (err) console.log(err, err.stack);
//             else {
//               con.query(
//                 `UPDATE happyagility.freshSc SET sentiments='${data.Sentiment}' where fresh_id=${rs.fresh_id}`,
//                 function (err, result, fields) {
//                   if (err) console.log(err);
//                   if (result) console.log(result);
//                 }
//               );
//               console.log("Successfully updated for ", rs.fresh_id);
//             }
//           });
//         } else {
//           con.query(
//             `UPDATE happyagility.freshSc SET sentiments=${"Empty"} where fresh_id=${
//               rs.fresh_id
//             }`,
//             function (err, result, fields) {
//               if (err) console.log(err);
//               if (result) console.log(result);
//             }
//           );
//         }
//       });
//     }
//   }
// );

// Hubspot
// con.query(
//   `SELECT * FROM happyagility.hubSc WHERE sentiments="Not Generated"`,
//   function (err, resultSelect, fields) {
//     if (err) console.log(err);
//     if (resultSelect) {
//       resultSelect.forEach((rs) => {
//         if (rs.Body.length > 0) {
//           const params = {
//             LanguageCode: "en",
//             Text: rs.Body,
//           };
//           comprehend.detectSentiment(params, function (err, data) {
//             if (err) console.log(err, err.stack);
//             else {
//               con.query(
//                 `UPDATE happyagility.hubSc SET sentiments='${data.Sentiment}' where hub_id=${rs.hub_id}`,
//                 function (err, result, fields) {
//                   if (err) console.log(err);
//                   if (result) console.log(result);
//                 }
//               );
//               console.log("Successfully updated for ", rs.hub_id);
//             }
//           });
//         } else {
//           con.query(
//             `UPDATE happyagility.hubSc SET sentiments=${"Empty"} where hub_id=${
//               rs.hub_id
//             }`,
//             function (err, result, fields) {
//               if (err) console.log(err);
//               if (result) console.log(result);
//             }
//           );
//         }
//       });
//     }
//   }
// );

// Give access
app.post("/give_survey_access", (req, res) => {
  if (req.query.main_user_id && req.query.to_user_id) {
    console.log("Give survey access request received");
    con.connect(function (err) {
      con.query(
        `SELECT user_email FROM happyagility.accounts where user_email='${req.query.to_user_id}' limit 1`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) {
            if (result.length > 0) {
              con.connect(function (err) {
                con.query(
                  `INSERT INTO happyagility.access (main_user_id, to_user_id, survey_name, database_unique_survey_id, survey_type) VALUES ('${req.query.main_user_id}', '${req.query.to_user_id}','${req.query.survey_name}','${req.query.database_unique_survey_id}', '${req.query.survey_type}')`,
                  function (err, result, fields) {
                    if (err) res.send(err);
                    if (result) res.send(result);
                    if (fields) console.log(fields);
                  }
                );
              });
            } else {
              res.send({ error: "No Email" });
            }
          }
        }
      );
    });
  }
});

// Give action access
app.post("/give_action_access", (req, res) => {
  if (req.query.main_user_id && req.query.to_user_id) {
    console.log("Give action access request received");
    con.connect(function (err) {
      con.query(
        `SELECT user_email FROM happyagility.accounts where user_email='${req.query.to_user_id}' limit 1`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) {
            if (result.length > 0) {
              con.connect(function (err) {
                con.query(
                  `INSERT INTO happyagility.action_access (main_user_id, to_user_id, trello_name, trello_id) VALUES ('${req.query.main_user_id}', '${req.query.to_user_id}','${req.query.trello_name}','${req.query.trello_id}')`,
                  function (err, result, fields) {
                    if (err) res.send(err);
                    if (result) res.send(result);
                    if (fields) console.log(fields);
                  }
                );
              });
            } else {
              res.send({ error: "No Email" });
            }
          }
        }
      );
    });
  }
});

// Get All Given Access Details
app.get("/get_access_list", authorizeUser, (req, res) => {
  console.log("Get all access request received");
  if (req.query.user_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.access where main_user_id='${req.query.user_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log({ status: 400 });
  }
});

// Get All Given Action Access Details
app.get("/get_action_access_list", (req, res) => {
  console.log("Get all action access request received");
  if (req.query.user_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.action_access where main_user_id='${req.query.user_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User_id not found");
  }
});

// Get All Shared Access
app.get("/get_shared_surveys", authorizeUser, (req, res) => {
  console.log("Get shared surveys request received");
  if (req.query.user_email) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.access where to_user_id='${req.query.user_email}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    res.send({ status: 400 });
  }
});

// Get All Shared Action Access
app.get("/get_shared_actions", (req, res) => {
  console.log("Get all access request received");
  if (req.query.user_email) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.action_access where to_user_id='${req.query.user_email}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_email not found");
  }
});

// check_survey_access
app.get("/check_survey_access", (req, res) => {
  console.log("Check survey access request received");
  if (req.query.database_unique_survey_id && req.query.curr_user_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.access where to_user_id='${req.query.curr_user_id}' and database_unique_survey_id='${req.query.database_unique_survey_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_email not found");
  }
});

// check_ip_allowed
app.get("/check_ip_allowed", (req, res) => {
  console.log("Check Ip Allowed access request received");
  if (req.query.database_unique_survey_id) {
    con.connect(function (err) {
      con.query(
        `SELECT ip_address FROM happyagility.answers where survey_id='${req.query.database_unique_survey_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("Database unique survey id not found");
  }
});

// Only Brand Name update
app.post("/brand_name_update", authorizeUser, (req, res) => {
  if (req.query.survey_id && req.query.brand_name) {
    console.log("Brand name update request received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET brand_name="${req.query.brand_name}" where database_unique_survey_id="${req.query.survey_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("Brand name or survey id not present");
  }
});

// Only Brand Location update
app.post("/brand_location_update", authorizeUser, (req, res) => {
  if (req.query.survey_id && req.query.brand_location) {
    console.log("Brand location update request received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET brand_location="${req.query.brand_location}" where database_unique_survey_id="${req.query.survey_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("Brand location or survey id not present");
  }
});

// Actions created by user
app.get("/user_actions", (req, res) => {
  con.connect(function (err) {
    con.query(
      `SELECT * FROM happyagility.actionItems WHERE user_id='${req.query.user_id}'`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  });
});

// get_shared_trello_list
app.get("/get_shared_trello_list", (req, res) => {
  console.log(
    "Get shared Trello List access request received",
    req.query.to_user_id
  );
  if (req.query.to_user_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.action_access where to_user_id='${req.query.to_user_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("To user id not found");
  }
});

// This is to upload survey picture for user account
app.post("/upload_survey_bg_image", (req, res) => {
  if (req.query.user_id && req.query.bgImage) {
    console.log("Bg Image upload Request received");
    con.connect(function (err) {
      con.query(
        `INSERT INTO happyagility.survey_images (account_id, image_url) VALUES ('${req.query.user_id}', '${req.query.bgImage}')`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("User Id or Image Url is Missing");
  }
});

// Get All Survey Images Uploaded for this account
app.get("/get_uploaded_bg_images", (req, res) => {
  console.log("Get uploaded bg images request received");
  if (req.query.user_id) {
    con.connect(function (err) {
      con.query(
        `SELECT image_url FROM happyagility.survey_images where account_id='${req.query.user_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("User id not found");
  }
});

// Change Survey Bg Image
app.post("/save_survey_bg_image", (req, res) => {
  if (req.query.database_unique_survey_id && req.query.survey_image) {
    console.log("Survey bg change image request received");
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET survey_bg_image="${req.query.survey_image}" where database_unique_survey_id="${req.query.database_unique_survey_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("Survey Image or Survey Id not present");
  }
});

// Deleting given survey access
app.post("/remove_survey_access", (req, res) => {
  if (req.query.survey_name && req.query.to_user_id) {
    console.log("Survey access deletion request received");
    con.connect(function (err) {
      con.query(
        `DELETE from happyagility.access where survey_name="${req.query.survey_name}" and to_user_id="${req.query.to_user_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result)
            res.send({
              database_question_id: req.query.database_question_id,
            });
          if (fields) console.log(fields);
        }
      );
    });
  }
});

// Deleting given action access
app.post("/remove_action_access", (req, res) => {
  if (req.query.trello_name && req.query.to_user_id) {
    console.log("Action access deletion request received");
    con.connect(function (err) {
      con.query(
        `DELETE from happyagility.action_access where trello_name="${req.query.trello_name}" and to_user_id="${req.query.to_user_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result)
            res.send({
              database_question_id: req.query.database_question_id,
            });
          if (fields) console.log(fields);
        }
      );
    });
  }
});

// Get amazon reviews polarity for user_azsc_id
app.get("/get_az_reviews_polarity", authorizeUser, (req, res) => {
  console.log("Get amazon reviews polarity for user_azsc_id request received");
  if (req.query.user_azsc_id) {
    con.connect(function (err) {
      con.query(
        `SELECT polarity, rating, date, location, sentiments FROM happyagility.amazonReviewsSc where user_azsc_id='${req.query.user_azsc_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_azsc_id not found");
  }
});

// Get amazon reviews aspects for user_azsc_id
app.get("/get_aspects_details", authorizeUser, (req, res) => {
  console.log("Get amazon aspects details for user_azsc_id request received");
  if (req.query.user_azsc_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.amazonAspects where user_azsc_id='${req.query.user_azsc_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_azsc_id not found");
  }
});
// Get amazon reviews aspects sentences for user_azsc_id
app.get("/get_aspects_sentences", authorizeUser, (req, res) => {
  console.log(
    "Get amazon aspects sentences details for user_azsc_id request received"
  );
  if (req.query.user_azsc_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.amazonAspSentences where user_azsc_id='${req.query.user_azsc_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("user_azsc_id not found");
  }
});

// Deleting amazon url data
app.post("/delete_amazon_url_data", (req, res) => {
  if (req.query.user_azsc_id && req.query.user_id) {
    console.log("Delete Amazon request received");
    con.connect(function (err) {
      con.query(
        `DELETE from happyagility.az_cluster_keywords where user_id="${req.query.user_id}" and user_azsc_id="${req.query.user_azsc_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) {
            con.query(
              `DELETE from happyagility.amazonStatements where user_id="${req.query.user_id}" and user_azsc_id="${req.query.user_azsc_id}"`,
              function (err, result, fields) {
                if (err) res.send(err);
                if (result) {
                  con.query(
                    `DELETE from happyagility.amazonKeywords where user_id="${req.query.user_id}" and user_azsc_id="${req.query.user_azsc_id}"`,
                    function (err, result, fields) {
                      if (err) res.send(err);
                      if (result) {
                        con.query(
                          `DELETE from happyagility.amazonAspects where user_id="${req.query.user_id}" and user_azsc_id="${req.query.user_azsc_id}"`,
                          function (err, result, fields) {
                            if (err) res.send(err);
                            if (result) {
                              con.query(
                                `DELETE from happyagility.amazonAspSentences where user_id="${req.query.user_id}" and user_azsc_id="${req.query.user_azsc_id}"`,
                                function (err, result, fields) {
                                  if (err) res.send(err);
                                  if (result) {
                                    con.query(
                                      `DELETE from happyagility.amazonReviewsSc where user_id="${req.query.user_id}" and user_azsc_id="${req.query.user_azsc_id}"`,
                                      function (err, result, fields) {
                                        if (err) res.send(err);
                                        if (result) {
                                          con.query(
                                            `DELETE from happyagility.amazonRequest where user_id="${req.query.user_id}" and website="${req.query.user_azsc_id}"`,
                                            function (err, result, fields) {
                                              if (err) res.send(err);
                                              if (result) res.send(result);
                                              if (fields) console.log(fields);
                                            }
                                          );
                                        }
                                        if (fields) console.log(fields);
                                      }
                                    );
                                  }
                                  if (fields) console.log(fields);
                                }
                              );
                            }
                            if (fields) console.log(fields);
                          }
                        );
                      }
                      if (fields) console.log(fields);
                    }
                  );
                }
                if (fields) console.log(fields);
              }
            );
          }

          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("user_azsc_id or user_id not present");
  }
});

// To keep python server awake
const keepAwake = new CronJob("*/5 * * * *", () => {
  // request(
  //             `https://python-ha.herokuapp.com/amazon_reviews?user_azsc_id=${encodeURIComponent(
  //               req.query.website
  //             )}&user_id=${req.query.user_id}&type=${req.query.type}`,
  //             function (error, response, body) {
  //               console.log(body);
  //             }
  //           );
  // console.log("Firing amazon request");
  // con.connect(function (err) {
  //   con.query(
  //     `SELECT * FROM happyagility.amazonRequest where status='Not Performed'`,
  //     function (err, result, fields) {
  //       if (err) res.send(err);
  //       if (result) {
  //         if (result.length > 0) {
  //           request(`https://python-ha.herokuapp.com/amazon_reviews`);
  //         }
  //       }
  //     }
  //   );
  // });
  // request(`https://python-ha.herokuapp.com`, function (error, response, body) {
  //   console.log(body);
  //   console.log(error);
  //   console.log(response);
  // });
});
keepAwake.start();

// var params = {
//   Message: "this is a test message",
//   MessageStructure: "string",
//   PhoneNumber: "+919892081390",
// };

// // Create promise and SNS service object
// var publishTextPromise = new AWS.SNS({ apiVersion: "2010-03-31" })
//   .publish(params)
//   .promise();

// // Handle promise's fulfilled/rejected states
// publishTextPromise
//   .then(function (data) {
//     console.log("MessageID is ", JSON.stringify(data));
//   })
//   .catch(function (err) {
//     console.error(err, err.stack);
//   });

// Add filters for survey
app.post("/add_filter", (req, res) => {
  if (req.query.survey_id) {
    console.log("Add filter to survey request received !");
    con.connect(function (err) {
      var values = [
        [
          req.query.filter_name,
          req.query.category_name,
          req.query.option_name,
          req.query.survey_id,
        ],
      ];
      con.query(
        `INSERT INTO happyagility.surveyFilters (filter_name, category_name, option_name, survey_id) VALUES ? `,
        [values],
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  }
});

// Get all filters for survey
app.get("/get_filters", (req, res) => {
  console.log("Filters details request received");
  if (req.query.survey_id) {
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.surveyFilters where survey_id='${req.query.survey_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("survey_id Id Not Present !!!");
  }
});

// delete filter options
app.post("/delete_filter_option", (req, res) => {
  console.log("Filter option deletion request received");
  if (req.query.survey_id && req.query.option_name && req.query.filter_name) {
    console.log(req.query);
    con.connect(function (err) {
      con.query(
        `DELETE from happyagility.surveyFilters where survey_id="${req.query.survey_id}" and option_name="${req.query.option_name}" and filter_name="${req.query.filter_name}"`,
        function (err, result, fields) {
          if (err) {
            console.log("Filter error");
            res.send(err);
          }
          if (result) {
            console.log("Filter deleted", result);
            con.query(
              `UPDATE happyagility.questions SET ${req.query.filter_name}="null" where survey_id="${req.query.survey_id}" and ${req.query.filter_name}="${req.query.option_name}"`,
              function (err, result1, fields) {
                if (err) res.send(err);
                if (result1) res.send(result1);
                if (fields) console.log(fields);
              }
            );
          }
        }
      );
    });
  } else {
    console.log("survey_id or option name or filter name not present !!!");
  }
});

// update_linked_question_filters
app.post("/update_linked_question_filters", (req, res) => {
  console.log("Update linked question filters request received");
  if (req.query.linked) {
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.questions SET ${req.query.filterName}="${req.query.optionName}" where linking="${req.query.linked}"`,
        function (err, result1, fields) {
          if (err) res.send(err);
          if (result1) res.send(result1);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("linked Id Not Present !!!");
  }
});

// Get all labels of the survey
app.get("/survey_labels", (req, res) => {
  if (req.query.survey_id) {
    console.log("Get all labels of survey request received");
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.questions WHERE survey_id='${req.query.survey_id}' and answer_type='Label'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("Survey id is not present");
  }
});

// Get all linked questions to label
app.get("/get_linked_questions", (req, res) => {
  if (req.query.linking) {
    console.log("Get all linked questions of label request received");
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.questions WHERE linking='${req.query.linking}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("Linking id is not present");
  }
});

// Save bulk option
app.post("/add_bulk_option", (req, res) => {
  if (
    req.query.question_id &&
    req.query.survey_id &&
    req.query.bulk_option &&
    req.query.database_option_id
  ) {
    console.log("Save bulk option request received");
    con.query(
      `INSERT INTO happyagility.bulk_options (survey_id, question_id, bulk_option, database_option_id) VALUES ('${req.query.survey_id}', '${req.query.question_id}','${req.query.bulk_option}', '${req.query.database_option_id}')`,
      function (err, result, fields) {
        if (err) res.send(err);
        if (result) {
          res.send(result);
        }
        if (fields) res.send(fields);
      }
    );
  } else {
    console.log("Question_id or Survey_id or Bulk_option is not present");
  }
});

// Get all bulk options
app.get("/get_bulk_options", (req, res) => {
  if (req.query.question_id) {
    console.log("Get all bulk options request received");
    con.connect(function (err) {
      con.query(
        `SELECT * FROM happyagility.bulk_options WHERE question_id='${req.query.question_id}'`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("Question id is not present");
  }
});

// Get all bulk options by survey
app.get("/get_bulk_options_by_survey", authorizeUser, (req, res) => {
  if (req.query.survey_id) {
    console.log("Get all bulk options request received for survey");
    con.connect(function (err) {
      con.query(
        `SELECT question_id, bulk_option, converted_bulk_option FROM happyagility.bulk_options use index(idx_survey_id) WHERE survey_id='${req.query.survey_id}'`,
        function (err, result) {
          if (err) res.send(err);
          if (result) res.send(result);
        }
      );
    });
  } else {
    console.log("Survey id is not present");
  }
});

// update this bulk option
app.post("/update_bulk_option", (req, res) => {
  console.log("Update bulk option request received");
  if (req.query.bulk_option_id) {
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.bulk_options SET bulk_option="${req.query.bulk_option}" where database_option_id="${req.query.bulk_option_id}"`,
        function (err, result1, fields) {
          if (err) res.send(err);
          if (result1) res.send(result1);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("bulk_option_id Not Present !!!");
  }
});

// delete bulk option with option id
app.post("/delete_bulk_option", (req, res) => {
  if (req.query.database_option_id) {
    console.log("Delete bulk option request received");
    con.connect(function (err) {
      con.query(
        `DELETE from happyagility.bulk_options where database_option_id="${req.query.database_option_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("database_option_id not present");
  }
});

// delete bulk options with question id
app.post("/delete_bulk_option_for_question", (req, res) => {
  if (req.query.database_question_id) {
    console.log("Delete all bulk option request received");
    con.connect(function (err) {
      con.query(
        `DELETE from happyagility.bulk_options where question_id="${req.query.database_question_id}"`,
        function (err, result, fields) {
          if (err) res.send(err);
          if (result) res.send(result);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("database_question_id not present");
  }
});

//update the database question id of child
app.post("/update_dbquid", (req, res) => {
  console.log("Update database question id request received");
  if (req.query.question_id && req.query.new_database_question_id) {
    console.log(req.query.question_id, req.query.new_database_question_id);
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.questions SET database_question_id=${req.query.new_database_question_id} where question_id=${req.query.question_id}`,
        function (err, result1, fields) {
          if (err) res.send(err);
          if (result1) res.send(result1);
          if (fields) console.log(fields);
        }
      );
    });
  } else {
    console.log("database_question_id Not Present !!!");
  }
});

// Get google business details
app.get("/business_details", (req, res) => {
  if (req.query.place_id) {
    console.log("Google business details requested");
    var config = {
      method: "get",
      url: `https://maps.googleapis.com/maps/api/place/details/json?place_id=${req.query.place_id}&key=AIzaSyCIFfENVxCm1NS9Ay218-ImJaVSogR3Orc`,
      headers: {},
    };
    axios(config)
      .then(function (response) {
        res.send(response.data);
      })
      .catch(function (error) {
        res.send(error);
      });
  } else {
    console.log("place_id not present");
  }
});

const cognito = new AWS.CognitoIdentityServiceProvider();

// delete account and account data
app.post("/delete_account", (req, res) => {
  if (req.query.user_id) {
    console.log("Delete account and account data request received");
    con.connect(function (err) {
      con.query(
        `SELECT database_unique_survey_id FROM happyagility.surveys WHERE user_id = "${req.query.user_id}";`,
        function (err, result) {
          if (err) res.send(err);
          if (result) {
            result.map((survey, i) => {
              con.query(
                `DELETE from happyagility.access where database_unique_survey_id="${survey.database_unique_survey_id}"`,
                function (err1, result1) {
                  if (err1) res.send(err1);
                  if (result1) {
                    con.query(
                      `DELETE from happyagility.answers where survey_id="${survey.database_unique_survey_id}"`,
                      function (err2, result2) {
                        if (err2) res.send(err2);
                        if (result2) {
                          con.query(
                            `DELETE from happyagility.bulk_options where survey_id="${survey.database_unique_survey_id}"`,
                            function (err3, result3) {
                              if (err3) res.send(err3);
                              if (result3) {
                                con.query(
                                  `DELETE from happyagility.keywords where survey_id="${survey.database_unique_survey_id}"`,
                                  function (err4, result4) {
                                    if (err4) res.send(err4);
                                    if (result4) {
                                      con.query(
                                        `DELETE from happyagility.questions where survey_id="${survey.database_unique_survey_id}"`,
                                        function (err5, result5) {
                                          if (err5) res.send(err5);
                                          if (result5) {
                                            con.query(
                                              `DELETE from happyagility.statements where survey_id="${survey.database_unique_survey_id}"`,
                                              function (err6, result6) {
                                                if (err6) res.send(err6);
                                                if (result6) {
                                                  con.query(
                                                    `DELETE from happyagility.surveyFilters where survey_id="${survey.database_unique_survey_id}"`,
                                                    function (err7, result7) {
                                                      if (err7) res.send(err7);
                                                      if (result7) {
                                                      }
                                                    }
                                                  );
                                                }
                                              }
                                            );
                                          }
                                        }
                                      );
                                    }
                                  }
                                );
                              }
                            }
                          );
                        }
                      }
                    );
                  }
                }
              );
              if (i === result.length - 1) {
                con.query(
                  `DELETE from happyagility.actionItems where user_id="${req.query.user_id}"`,
                  function (err8, result8) {
                    if (err8) res.send(err8);
                    if (result8) {
                      con.query(
                        `DELETE from happyagility.action_access where main_user_id="${req.query.user_id}"`,
                        function (err9, result9) {
                          if (err9) res.send(err9);
                          if (result9) {
                            con.query(
                              `DELETE from happyagility.contacts where account_id="${req.query.user_id}"`,
                              function (err10, result10) {
                                if (err10) res.send(err10);
                                if (result10) {
                                  con.query(
                                    `DELETE from happyagility.survey_images where account_id="${req.query.user_id}"`,
                                    function (err11, result11) {
                                      if (err11) res.send(err11);
                                      if (result11) {
                                        con.query(
                                          `DELETE from happyagility.surveys where user_id="${req.query.user_id}"`,
                                          function (err12, result12) {
                                            if (err12) res.send(err12);
                                            if (result12) {
                                              console.log(result12);
                                              if (
                                                req.query.user_id.length > 21
                                              ) {
                                                cognito.adminDeleteUser({
                                                  UserPoolId:
                                                    "us-east-1_ETQdANc8H",
                                                  Username: `${req.query.user_id}`,
                                                });
                                                res.send(result12);
                                              } else {
                                                res.send(result12);
                                              }
                                            }
                                          }
                                        );
                                      }
                                    }
                                  );
                                }
                              }
                            );
                          }
                        }
                      );
                    }
                  }
                );
              }
            });
            if (result.length < 1) {
              con.query(
                `DELETE from happyagility.actionItems where user_id="${req.query.user_id}"`,
                function (err8, result8) {
                  if (err8) res.send(err8);
                  if (result8) {
                    con.query(
                      `DELETE from happyagility.action_access where main_user_id="${req.query.user_id}"`,
                      function (err9, result9) {
                        if (err9) res.send(err9);
                        if (result9) {
                          con.query(
                            `DELETE from happyagility.contacts where account_id="${req.query.user_id}"`,
                            function (err10, result10) {
                              if (err10) res.send(err10);
                              if (result10) {
                                con.query(
                                  `DELETE from happyagility.survey_images where account_id="${req.query.user_id}"`,
                                  function (err11, result11) {
                                    if (err11) res.send(err11);
                                    if (result11) {
                                      con.query(
                                        `DELETE from happyagility.surveys where user_id="${req.query.user_id}"`,
                                        function (err12, result12) {
                                          if (err12) res.send(err12);
                                          if (result12) {
                                            con.query(
                                              `DELETE from happyagility.accounts where account_id="${req.query.user_id}"`,
                                              function (err13, result13) {
                                                if (err13) res.send(err13);
                                                if (result13) {
                                                  if (
                                                    req.query.user_id.length >
                                                    21
                                                  ) {
                                                    cognito.adminDeleteUser(
                                                      {
                                                        UserPoolId:
                                                          "us-east-1_ETQdANc8H",
                                                        Username: `${req.query.user_id}`,
                                                      },
                                                      function (errf, data) {
                                                        if (errf)
                                                          console.log(
                                                            "Err",
                                                            errf,
                                                            errf.stack
                                                          );
                                                        // an error occurred
                                                        else
                                                          console.log(
                                                            "Data",
                                                            data
                                                          ); // successful response
                                                      }
                                                    );
                                                    res.send(result13);
                                                  } else {
                                                    res.send(result13);
                                                  }
                                                }
                                              }
                                            );
                                          }
                                        }
                                      );
                                    }
                                  }
                                );
                              }
                            }
                          );
                        }
                      }
                    );
                  }
                }
              );
            }
          }
        }
      );
    });
  } else {
    console.log("user_id not present");
  }
});

//update the latest score
app.post("/update_latest_score", authorizeUser, (req, res) => {
  console.log("Update latest score request received");
  if (req.query.survey_id && req.query.latest_score) {
    con.connect(function (err) {
      con.query(
        `UPDATE happyagility.surveys SET latest_score='${req.query.latest_score}' where database_unique_survey_id=${req.query.survey_id}`,
        function (err, result1) {
          if (err) console.log(err);
          if (result1) console.log(result1);
        }
      );
    });
  } else {
    console.log("survey_id or latest_score Not Present !!!");
  }
});

// Get 30 comments
app.get("/get_30_comments", authorizeUser, (req, res) => {
  console.log("30 comments request received");
  con.query(
    `SELECT amazonsc_id, Body, sentiments, date, topic FROM happyagility.amazonReviewsSc where user_azsc_id="${req.query.product}" limit 30 offset ${req.query.offset}`,
    function (err, result) {
      if (err) res.send(err);
      if (result) res.send(result);
    }
  );
});

// Get Entities for mentioned start and end ids
app.get("/get_corresponding_entites", authorizeUser, (req, res) => {
  console.log("Entities request received");
  con.query(
    `SELECT * FROM happyagility.amazonEntities where amazon_review_id in(${req.query.ids.substring(
      1,
      req.query.ids.length - 1
    )}) `,
    function (err, result) {
      if (err) res.send(err);
      if (result) res.send(result);
    }
  );
});

// Get targeted sentiment entities for mentioned start and end ids
app.get("/get_corresponding_targsent_entites", (req, res) => {
  console.log("Targsent entities request received");
  con.query(
    `SELECT * FROM happyagility.amazonTargetedSentiment where amazon_review_id in(${req.query.ids.substring(
      1,
      req.query.ids.length - 1
    )}) `,
    function (err, result) {
      if (err) res.send(err);
      if (result) res.send(result);
    }
  );
});

// Get total count of comments
app.get("/total_comments", authorizeUser, (req, res) => {
  console.log("Total comments request received");
  con.query(
    `SELECT Count(*) as total FROM happyagility.amazonReviewsSc where user_azsc_id="${req.query.product}"`,
    function (err, result) {
      if (err) res.send(err);
      if (result) res.send(result);
    }
  );
});

// Get Keyphrases for mentioned start and end ids
app.get("/get_corresponding_keyphrases", (req, res) => {
  console.log("Keyphrases request received");
  let reqString = req.query.ids;
  reqString = req.query.ids.substring(1, req.query.ids.length - 1);
  con.query(
    `SELECT * FROM happyagility.amazonKeyphrases where amazon_review_id in(${reqString})`,
    function (err, result) {
      if (err) res.send(err);
      if (result) res.send(result);
    }
  );
});

// Get Keyphrases for array of amazon_review_id
app.get(
  "/get_corresponding_keyphrases_for_array",
  authorizeUser,
  (req, res) => {
    console.log("Keyphrases request received");
    let reqString = req.query.ids;
    reqString = req.query.ids.substring(1, req.query.ids.length - 1);
    con.query(
      `SELECT * FROM happyagility.amazonKeyphrases where amazon_review_id in(${reqString})`,
      function (err, result) {
        if (err) res.send(err);
        if (result) res.send(result);
      }
    );
  }
);

// See if keyphrase exists in keyphrase table
app.get("/keyphrase_exist", authorizeUser, (req, res) => {
  console.log("Keyphrases exists or not request received");
  con.query(
    `SELECT azkp_id FROM happyagility.amazonKeyphrases where keyphrase like "%${req.query.keyphrase}%" and website="${req.query.product}" limit 1`,
    function (err, result) {
      if (err) res.send(err);
      if (result) res.send(result);
    }
  );
});

// See if entity exists in enities table
app.get("/entity_exist", authorizeUser, (req, res) => {
  console.log("Entity exists or not request received");
  con.query(
    `SELECT azen_id FROM happyagility.amazonEntities where entity like "%${req.query.entity}%" and website="${req.query.product}" limit 1`,
    function (err, result) {
      if (err) res.send(err);
      if (result) res.send(result);
    }
  );
});

// See if targsent entity exists in targsent table
app.get("/targsent_entity_exist", (req, res) => {
  console.log("Targsent entity exists or not request received");
  con.query(
    `SELECT amazon_targsent_id FROM happyagility.amazonTargetedSentiment where text like "%${req.query.entity}%" and website="${req.query.product}" limit 1`,
    function (err, result) {
      if (err) res.send(err);
      if (result) res.send(result);
    }
  );
});

// See if topic exists in amazon reviews table - topic column
app.get("/topic_exist", (req, res) => {
  console.log("Topic exists or not request received");
  con.query(
    `SELECT amazonsc_id FROM happyagility.amazonReviewsSc where topic like "%${req.query.topic}%" and user_azsc_id="${req.query.product}" limit 1`,
    function (err, result) {
      if (err) res.send(err);
      if (result) res.send(result);
    }
  );
});

// Get count of total comments based on keyphrase
app.get("/total_comments_keyphrase", authorizeUser, (req, res) => {
  console.log("Total comments based on keyphrase request received");
  con.query(
    `SELECT Count(*) as total FROM happyagility.amazonReviewsSc where user_azsc_id="${req.query.product}" and Body like "%${req.query.keyphrase}%"`,
    function (err, result) {
      if (err) res.send(err);
      if (result) res.send(result);
    }
  );
});

// Get count of total comments based on entity
app.get("/total_comments_entity", authorizeUser, (req, res) => {
  console.log("Total comments based on entity request received");
  con.query(
    `SELECT Count(*) as total FROM happyagility.amazonReviewsSc where user_azsc_id="${req.query.product}" and Body like "%${req.query.entity}%"`,
    function (err, result) {
      if (err) res.send(err);
      if (result) res.send(result);
    }
  );
});

// Get count of total comments based on entity
app.get("/total_comments_targsent_entity", (req, res) => {
  console.log("Total comments based on targ sent entity request received");
  con.query(
    `SELECT Count(*) as total FROM happyagility.amazonReviewsSc where user_azsc_id="${req.query.product}" and Body like "%${req.query.entity}%"`,
    function (err, result) {
      if (err) res.send(err);
      if (result) res.send(result);
    }
  );
});

// Get count of total comments based on topic
app.get("/total_comments_topic", (req, res) => {
  console.log("Total comments based on topic request received");
  con.query(
    `SELECT Count(*) as total FROM happyagility.amazonReviewsSc where user_azsc_id="${req.query.product}" and topic like "%${req.query.topic}%"`,
    function (err, result) {
      if (err) res.send(err);
      if (result) res.send(result);
    }
  );
});

// Get 30 comments based on keyphrase
app.get("/get_30_comments_keyphrase", authorizeUser, (req, res) => {
  console.log("30 comments request received");
  con.query(
    `SELECT amazonsc_id, Body, sentiments, date FROM happyagility.amazonReviewsSc where user_azsc_id="${req.query.product}" and Body like "%${req.query.keyphrase}%" limit 30 offset ${req.query.offset}`,
    function (err, result) {
      if (err) res.send(err);
      if (result) res.send(result);
    }
  );
});

// Get 30 comments based on entity
app.get("/get_30_comments_entity", authorizeUser, (req, res) => {
  console.log("30 comments request received");
  con.query(
    `SELECT amazonsc_id, Body, sentiments, date FROM happyagility.amazonReviewsSc where user_azsc_id="${req.query.product}" and Body like "%${req.query.entity}%" limit 30 offset ${req.query.offset}`,
    function (err, result) {
      if (err) res.send(err);
      if (result) res.send(result);
    }
  );
});

// Get 30 comments based on entity
app.get("/get_30_comments_targsent_entity", (req, res) => {
  console.log("30 comments request received");
  con.query(
    `SELECT amazonsc_id, Body, sentiments, date FROM happyagility.amazonReviewsSc where user_azsc_id="${req.query.product}" and Body like "%${req.query.entity}%" limit 30 offset ${req.query.offset}`,
    function (err, result) {
      if (err) res.send(err);
      if (result) res.send(result);
    }
  );
});

// Get 30 comments based on topic
app.get("/get_30_comments_topic", (req, res) => {
  console.log("30 comments request received");
  con.query(
    `SELECT amazonsc_id, Body, sentiments, date, topic FROM happyagility.amazonReviewsSc where user_azsc_id="${req.query.product}" and topic like "%${req.query.topic}%" limit 30 offset ${req.query.offset}`,
    function (err, result) {
      if (err) res.send(err);
      if (result) res.send(result);
    }
  );
});

app.get("/employees", (req, res) => {
  console.log("Employee request made");
  con.query(`SELECT * FROM happyagility.Testing`, function (err, result) {
    if (err) res.send(err);
    if (result) res.send(result);
  });
});

app.post("/employees/create", (req, res) => {
  console.log("Create request made");
  console.log(req.body);
  con.query(
    `INSERT INTO happyagility.Testing (name, age) VALUES ('${req.body.name}', ${req.body.age})`,
    function (err, result) {
      if (err) res.send(err);
      if (result) res.send(result);
    }
  );
});

app.put("/employees/update", (req, res) => {
  con.query(
    `UPDATE happyagility.Testing SET name='${req.body.name}', age=${req.body.age} where testing_id=${req.query.id}`,
    function (err, result) {
      if (err) res.send(err);
      if (result) res.send(result);
    }
  );
});

app.delete("/employees/delete", (req, res) => {
  con.query(
    `DELETE from happyagility.Testing where testing_id="${req.query.id}"`,
    function (err, result) {
      if (err) res.send(err);
      if (result) res.send(result);
    }
  );
});
