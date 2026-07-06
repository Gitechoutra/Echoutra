import random
from faker import Faker
from datetime import datetime, timedelta
from portal.models.records import Records
from portal.models.logstatus import LogStatus
from portal import InitApp


app = app = InitApp().app()
fake = Faker()


# Function to generate random datetime within a range


def random_date(start, end):
    return start + timedelta(
        seconds=random.randint(0, int((end - start).total_seconds())))

# Function to generate random time


def random_time():
    return timedelta(hours=random.randint(0, 23),
                     minutes=random.randint(0, 59),
                     seconds=random.randint(0, 59))

# Function to generate dummy data


def generate_dummy_data():
    with app.app_context():
        for _ in range(15000):
            record = Records()
            record.UserID = 1  # Assuming user IDs exist up to 100
            # Assuming project IDs exist up to 100
            record.ProjectID = 1
            # Assuming designation IDs exist up to 100
            record.DesignationID = 1
            record.Date = random_date(
                datetime(2023, 1, 1), datetime(2024, 3, 31))
            record.WorkingHours = "10:00:00"
            record.BillableType = random.choice(['Yes', 'No'])
            record.Description = fake.text()
            record.save()
            logstatus = LogStatus()
            logstatus.RecordID = record.RecordID
            # if record.BillableType == "No":
            #     logstatus.Status = "Approved"
            # else:
            logstatus.Status = "Pending"
            logstatus.save()


# Insert dummy data into the database


if __name__ == "__main__":
    generate_dummy_data()
