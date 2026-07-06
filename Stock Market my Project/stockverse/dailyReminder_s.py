import pyodbc
from portal.helpers.helpers import sendEmail
from stockverse.portal.helpers.email import missLogReminderTemplate
import datetime
import logging
from config.config import Development, Production, UAT
from dotenv import load_dotenv
import os

# Database connection settings
load_dotenv()
environment = os.getenv('Backend')
if environment == 'DEV':
    configfile = Development
elif environment == 'PROD':
    configfile = Production
elif environment == 'UAT':
    configfile = UAT

configfile = configfile.config
db_server = configfile['jobs']['db_server']
db_database = configfile['jobs']['db_database']
db_username = configfile['jobs']['db_username']
db_password = configfile['jobs']['db_password']

logging.basicConfig(filename=os.path.join(configfile['keys']['log_dir'], 'reminder.log'),
                    level=logging.INFO, format='%(asctime)s - %(levelname)s: %(message)s')


def check_log():
    try:
        logging.info("Reminder")
        # Connect to the SQL Server database
        today = datetime.datetime.today()
        yesterday = today-datetime.timedelta(days=1)
        if yesterday.weekday() in [5, 6]:
            logging.info("No reminder send for weekend")
            return
        conn = pyodbc.connect(
            f'DRIVER={{SQL Server}};SERVER={db_server};DATABASE={db_database};UID={db_username};PWD={db_password}'
        )
        cursor = conn.cursor()

        cursor.execute("SELECT Date FROM OfficeHolidays")
        holidays = cursor.fetchall()
        holidays = [date[0] for date in holidays]
        if str(yesterday.date()) in holidays:
            logging.info("No reminder send for Holiday")
            return

        # Execute a query to check if there are any logs in the table
        cursor.execute(
            "SELECT UserID,Name,Email,Status FROM Users WHERE Status = 'Active'")
        users = cursor.fetchall()
        for user in users:
            query = f"SELECT * FROM Records WHERE UserID = {user[0]} AND CAST(Date AS DATE) = '{yesterday.date()}' "
            cursor.execute(query)
            record = cursor.fetchone()
            logging.info(f"{user[0]}, {user[1]}:{record}")
            cursor.execute(
                f"SELECT * FROM UsersLeaves WHERE UserID = {user[0]} AND StartDate <= '{yesterday.date()}' AND EndDate >= '{yesterday.date()}'")
            leave = cursor.fetchone()
            if record is None and leave is None:
                subject = "Reminder: No Hours Logged Yesterday"
                msg = missLogReminderTemplate.format(name=user[1])
                sendEmail(to_address=user[2], subject=subject, msg_body=msg)
                logging.info("Mail send")
        conn.close()

    except Exception as e:
        logging.exception(f"An error occurred: {str(e)}")


check_log()
