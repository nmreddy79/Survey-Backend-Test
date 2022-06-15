const AWS = require("aws-sdk");

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
                <p><strong>Task:</strong> ${data.task_name}</p>
                <p><strong>Description:</strong> ${data.task_description}</p>
                <p><strong>Due date:</strong> ${data.due_date}</p>
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
        Charset: "UTF-8",
        Data: `${data.subject}`,
      },
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: htmlTemplate(data),
        },
      },
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
