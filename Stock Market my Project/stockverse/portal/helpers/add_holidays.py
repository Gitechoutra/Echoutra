import pandas as pd
from datetime import datetime
from pathlib import Path


def add(app):
    with app.app_context():
        from ..models.office_holidays import OfficeHolidays

        # Set up logging
        logger = app.logger
        logger.info("Started Adding Holidays")

        # Load the Excel file
        holidays_file = Path("docs/holidays.xlsx")
        if not holidays_file.exists():
            logger.error(f"File not found: {holidays_file}")
            return

        df = pd.read_excel(holidays_file)
        if "Holidays" not in df.columns:
            logger.error(f"'Holidays' column not found in {holidays_file}")
            return

        # Define date formats to try
        date_formats = ["%d-%m-%Y", "%d/%m/%Y", "%d %b %Y"]

        holidays = []
        for date_value in df["Holidays"]:
            if isinstance(date_value, datetime):
                holidays.append(date_value.date())
            elif isinstance(date_value, str):
                for date_format in date_formats:
                    try:
                        holidays.append(datetime.strptime(
                            date_value, date_format).date())
                        break
                    except ValueError:
                        raise ValueError(
                            f"Unrecognized date format: {date_value}")
            elif str(date_value) in ['nan', '', "None", None]:
                continue
            else:
                raise ValueError(
                    f"Unrecognized date data type: {date_value}")

        # Insert holidays into the database
        for holiday in holidays:
            if not OfficeHolidays.query.filter_by(Date=holiday).first():
                try:
                    oh = OfficeHolidays(Date=holiday)
                    oh.save()
                    logger.info(f"Added holiday: {holiday}")
                except Exception as e:
                    logger.error(f"Error adding holiday {holiday}: {e}")
                    raise ValueError(f"Error adding holiday {holiday}")
        logger.info("Holidays are added.")
