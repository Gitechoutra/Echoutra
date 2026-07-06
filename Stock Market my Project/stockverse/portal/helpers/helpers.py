def generate_OTP():
    import secrets
    return str(secrets.randbelow(1000000)).zfill(6)



from typing import Union
def sendEmail(to_address:Union[str, list] ,cc_address:Union[str, list]=None,subject: str=None,msg_body:str=None,attachment_path: Union[str, list]=None,spc_server=False,html_content=False):
    """_summary_

    Args:
        to (Union[str, list]): To email in form of str/list
        cc (Union[str, list], optional): CC email in form of str/list. Defaults to None.
        subject (str, optional): Subject for the Email. Defaults to None.
        msg_body (str, optional): Message for the Email. Defaults to None.
        attachment_path (Union[str, list], optional): file/folder path of attachment. Defaults to None.
    Returns:
        bool: True if success else False
    """
    from email.mime.text import MIMEText
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.base import MIMEBase
    from email import encoders
    from . import config,logger
    import os
    def extact_emails_from_str(email):
        """_summary_

        Args:
            email (str): emails in str formates

        Returns:
            str: email with valid formate 
        """
        if ";" in email:
            return ", ".join(email.split(";"))
        elif " " in email:
            return ", ".join(email.split(" "))
        elif ":" in email:
            return ", ".join(email.split(":"))
        else:
            return email
    try:
        # getting data from config.ini file
        mail_server=config['mail_server_Email']['MAILSERVER_DOMAIN']
        port=config['mail_server_Email']['MAILSERVER_PORT']
        sender_id=config['mail_server_Email']['MAILSERVER_USERNAME']
        sender_pwd=config['mail_server_Email']['MAILSERVER_PASSWORD']
        # Create the container (outer) email message.
        msg = MIMEMultipart()
        msg['From'] = sender_id
        if isinstance(to_address,list):
            msg['To']=", ".join(to_address)
        elif isinstance(to_address,str):
           msg['To']=extact_emails_from_str(to_address)
        if cc_address: 
            if isinstance(to_address,list):
                msg['CC']=", ".join(cc_address)
            elif isinstance(to_address,str):
                msg['CC']=extact_emails_from_str(cc_address)
        msg['Subject'] = subject
        if html_content:
            body = MIMEText(html_content, 'html')
            msg.attach(body)
        else:
            msg.attach(MIMEText(msg_body))
        
        # Add attachments
        if attachment_path:
            if isinstance(attachment_path,Union[list,tuple]):
                for i in attachment_path:
                    if os.path.isfile(i):
                        part = MIMEBase('application', "octet-stream")
                        part.set_payload(open(i, "rb").read())
                        encoders.encode_base64(part)
                        part.add_header('Content-Disposition', 'attachment', filename=i)
                        msg.attach(part)
                    else:
                        print(f"Attachment not found at given path {i}.")
                        return f"Attachment not found at given path {i}."
            elif isinstance(attachment_path,str):
                if os.path.isdir(attachment_path):
                    for file in os.listdir(attachment_path):
                        if file.endswith(("txt","jpg",'jpeg','png','pdf')):
                            filename = os.path.join(attachment_path,file)
                            part = MIMEBase('application', "octet-stream")
                            part.set_payload(open(filename, "rb").read())
                            encoders.encode_base64(part)
                            part.add_header('Content-Disposition', 'attachment', filename=filename)
                            msg.attach(part)
                elif os.path.isfile(attachment_path):
                    part = MIMEBase('application', "octet-stream")
                    part.set_payload(open(attachment_path, "rb").read())
                    encoders.encode_base64(part)
                    part.add_header('Content-Disposition', 'attachment', filename=attachment_path)
                    msg.attach(part)
                else:
                    logger.error(f"SMTP: Attachment path {attachment_path} is invalid")
                    return f"Attachment path {attachment_path} is invalid"
        if spc_server:
            SERVER = mail_server
            server = smtplib.SMTP(SERVER)
            server.send_message(sender_id, msg)
            server.quit()
            logger.info("Success using SMTP with Special Server.")
            return "Success"
        if port == "587":       
            server = smtplib.SMTP(mail_server, port)
            server.starttls()
            server.login(sender_id, sender_pwd)
            server.send_message(msg)
            del msg
            server.quit()
            logger.info("Success using SMTP at port: "+port)
            return "Success"
        elif port == "465":
            with smtplib.SMTP_SSL(mail_server, port) as server:
                server.login(sender_id, sender_pwd)
                server.send_message(msg)
                logger.info("Success using SMTP at port: "+port)
                return "Success"
        else:
            raise NameError(f"Invalid port:{port}")
       

    except Exception as e:
        logger.error(f"Failed in SMTP due to:\n{e}")
        return "Failed"




def generate_temp_password(length=8):
    import random
    import string
    characters = string.ascii_letters + string.digits
    temp_password = ''.join(random.choice(characters) for _ in range(length))
    return temp_password



from functools import wraps
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from portal.models.users import Users
from portal.models.roles import Roles
from flask import jsonify

def checkrole():
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()  # Verify the JWT token in the request headers
            token = get_jwt_identity()
            current_role = token.get('role')  # Get the role from the JWT token
            email =token.get('sub')
            user = Users.query.filter_by(Email=email).first()
            role_indb = Roles.query.filter_by(RoleID=user.RoleID).first()
            if current_role != role_indb:
                response = {'message': 'role got chnage so please login again.'}
                return jsonify(response=response, status=400,bool=False)
            return fn(*args, **kwargs)
        return wrapper
    return decorator

# import base64

# def encode_image(image_path):
#     with open(image_path, "rb") as image_file:
#         encoded_image = base64.b64encode(image_file.read()).decode("utf-8")
#     return encoded_image