import pandas as pd
from pathlib import Path


def adddesignations(app):
    with app.app_context():
        from ..models.designation import Designations

        # Set up logging
        logger = app.logger
        logger.info("Started Adding Designations")
        # Load the Excel file
        designations_file = Path("docs\Designations.xlsx")
        if not designations_file.exists():
            logger.error(f"File not found: {designations_file}")
            return

        df = pd.read_excel(designations_file)
        if "Designation" not in df.columns:
            logger.error(
                f"'Designation' column not found in {designations_file}")
            return

        for designation in df["Designation"]:
            if not Designations.query.filter(Designations.Designation == designation).first():
                new_designation = Designations()
                new_designation.Designation = designation
                new_designation.save()
        logger.info("Added Designations")
