const mysql = require('mysql2');

const con = mysql.createConnection({
    host:"happyagility.cf2p9vqamaaf.us-east-1.rds.amazonaws.com",
    user:"admin",
    password:"Survey2021",
    database:"happyagility"
});
// host:"happyagility.cjc4tn9rqbtf.us-west-2.rds.amazonaws.com",
//     user:'admin',
//     password:'Aerospace067',
//     database:'happyagility'

con.connect(function(err) {
    if(err) throw err;
    con.query(`CREATE TABLE IF NOT EXISTS accounts(account_id varchar(300), username varchar(30), user_email varchar(300), business_name varchar(300),job_title varchar(200),business_email varchar(300),account_type varchar(300),emails_allowed int,emails_used int,responses_allowed int, responses_got int,survey_allowed int,survey_used int,industry_name varchar(300),subscription_type varchar(300),date_time DATETIME, profile_pic varchar(2083) );`, function(error, result, fields){
        if(err) console.log(err);
        console.log(result)
    });

    con.query('CREATE TABLE IF NOT EXISTS surveys(survey_id int not null auto_increment, user_id varchar(200),user_email varchar(300), survey_name varchar(300), language varchar(200),brand_name varchar(300),brand_image_link varchar(500),left_text varchar(100),right_text varchar(100),follow_up_question varchar(500),status varchar(100),survey_type varchar(300),survey_datetime Datetime,appearance_question_color varchar(100),appearance_answer_color varchar(100),appearance_button_color varchar(100),bold varchar(50),italic varchar(50),underline varchar(50),qr_code_location varchar(500),survey_link varchar(500),database_unique_survey_id varchar(500),major_survey varchar(100), primary key(survey_id));', function(error, result, fields){
        if(err) console.log(err);
        console.log(result)
    });
    con.query('CREATE TABLE IF NOT EXISTS questions(question_id int not null auto_increment, survey_id varchar(200), questionText varchar(500), answer_type varchar(300), option1 varchar(100),option2 varchar(100),option3 varchar(100),option4 varchar(100),option5 varchar(100),question_datetime Datetime,database_question_id varchar(500), primary key(question_id));', function(error, result, fields){
        if(err) console.log(err);
        console.log(result)
    });
    con.query('CREATE TABLE IF NOT EXISTS answers(answer_id int not null auto_increment, question_id varchar(300), survey_id varchar(300), answer_type varchar(300), user_id varchar(300),answer varchar(500),answer_datetime Datetime,questionText varchar(500),option1 varchar(100),option2 varchar(100),option3 varchar(100),option4 varchar(100),option5 varchar(100),answer1 varchar(100),answer2 varchar(100),answer3 varchar(100),answer4 varchar(100),answer5 varchar(100),time_taken int,source varchar(100), primary key(answer_id));', function(error, result, fields){
        if(err) console.log(err);
        console.log(result)
    });
    con.query('CREATE TABLE IF NOT EXISTS contacts(contact_id int not null auto_increment, account_id varchar(300), status varchar(50), email varchar(300), comments varchar(300), group_id varchar(300),name varchar(200),group_name varchar(100),contact_datetime Datetime, primary key(contact_id));', function(error, result, fields){
        if(err) console.log(err);
        console.log(result)
    });
    con.end();
})