import pandas as pd
from pathlib import Path


def addpt(app):
    with app.app_context():
        from ..models.projectType import ProjectTypes
        from ..models.projects import Projects

        # Set up logging
        logger = app.logger
        logger.info("Started Adding Project_Type")

        # Load the Excel file
        pt_file = Path("docs\Project_Type.xlsx")
        if not pt_file.exists():
            logger.error(f"File not found: {pt_file}")
            raise FileNotFoundError

        df = pd.read_excel(pt_file)
        if "Project" not in df.columns and "Type" not in df.columns:
            logger.error(
                f"'Project', 'Type' column not found in {pt_file}")
            return

        types = df["Type"].unique()
        types_data = {}
        for type_ in types:
            if str(type_) not in ['nan', '', "None", None]:
                pt = ProjectTypes.query.filter_by(
                    ProjectType=str(type_).strip()).first()
                if not pt:
                    raise ValueError("Invalid Project Type")
                types_data[type_] = pt.PTID
        for record in df.to_dict("records"):
            if types_data.get(record["Type"]):
                p = Projects.query.filter_by(
                    Name=str(record["Project"]).strip()).first()
                if p:
                    p.PTID = types_data[record["Type"]]
                    p.save()
        logger.info("Project type are added to Projects")
