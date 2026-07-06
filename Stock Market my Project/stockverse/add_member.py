import pyodbc
import pandas as pd
from portal.helpers.encryption import Encryption
from portal.helpers.helpers import generate_temp_password, sendEmail
from stockverse.portal.helpers.email import welcomeTemplate


# Database connection settings
db_server = 'PocVM'
db_database = 'ManomayHours'
db_username = 'Timesheet'
db_password = 'Manomay123'

file_name = r"C:\Users\Manomayconsultancy\Desktop\Employee.xlsx"

try:
    conn = pyodbc.connect(
        f'DRIVER={{SQL Server}};SERVER={db_server};DATABASE={db_database};UID={db_username};PWD={db_password}'
    )
    cursor = conn.cursor()

    excel_data = pd.read_excel(file_name)
    columns = list(excel_data.columns)
    require_column = ["Name", "Email", "RoleID"]
    if columns != require_column:
        message = 'All require column not present in excel file.'
        print(message)
        raise ValueError(message)
    data_list = excel_data.to_dict(orient='records')
    for data in data_list:
        print(data)
        name = data.get("Name")
        email = data.get("Email")
        roleid = data.get("RoleID")
        Status = "New"
        temp_password = generate_temp_password()
        Password = Encryption().encrypt(temp_password)
        insert_query = f"""INSERT INTO Users (Name, Password, RoleID, LastDatePasswordUpdate, Email, Createdby, CreatedDate, Updatedby, UpdatedDate, OTP, OTP_generatedtime, Status)
                            VALUES ('{name}', '{Password}', {roleid}, '2023-09-14 10:00:00', '{email}', 3048, '2023-09-14 10:00:00', NULL, NULL, NULL, NULL, '{Status}');"""
        cursor.execute(insert_query)
        conn.commit()
        subject = 'Welcome to Manomay TimeSheet'
        msg = welcomeTemplate.format(
            name=name, email_id=email, password=temp_password)
        sendEmail(subject=subject, msg_body=msg, to_address=email)
        response = {'message': 'Member Created.'}
        print(response)


except Exception as e:
    print(e)
finally:
    conn.close()
