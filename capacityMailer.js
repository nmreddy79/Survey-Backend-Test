const AWS = require('aws-sdk');

const htmlTemplate = (data) => {
    return `
    <!DOCTYPE html>
            <html>
              <head>
                <style>
                #main{
                color:#091e42;
                font-weight:bold;
                font-size: 18px;
                }
                #happy{
                color:#535b63;
                font-size: 24px;
                }
                #agility{
                font-weight:700;
                color:#091e42;
                font-size: 22px;
                }
                #image{
                width:22px;
                height:22px;
                }
                </style>
              </head>
              <body>
                <p><strong>Dear ${data.username}, your capacity usage for this month is:</strong></p>
                <p><strong>Account type: </strong> ${data.account_type}</p>
                <p><strong>Emails Allowed: </strong> ${data.emails_allowed}</p>
                <p><strong>Emails Used: </strong> ${data.emails_used}</p>
                <p><strong>Responses Allowed: </strong> ${data.responses_allowed}</p>
                <p><strong>Responses Received: </strong> ${data.responses_got}</p>
                <p><strong>Surveys Allowed: </strong> ${data.survey_allowed}</p>
                <p><strong>Surveys Used: </strong> ${data.survey_used}</p>

                <p><span id="main">Powered By - </span><img id="image" src="https://happyagility.s3-us-west-2.amazonaws.com/H.jpg"/><span id="happy">appy</span><span id="agility">AGILITY</span></p>

              </body>
        </html>
      
    `;
};

module.exports.sendMail = (sender, receivers, data) => {
    const params = {
      Destination: {
        BccAddresses: receivers,  
      },
      Message: {
        Subject: {
          Charset: 'UTF-8',
          Data: `Capacity Usage Alert`
        },
        Body: {
          Html: {
            Charset: "UTF-8",
            Data: htmlTemplate(data)
          }
        }
      },
      Source: sender,
    };
  
    const sendPromise = new AWS.SES().sendEmail(params).promise();
  
    return sendPromise
      .then((data) => data)
      .catch((err) => {
        throw new Error(err);
      });
};