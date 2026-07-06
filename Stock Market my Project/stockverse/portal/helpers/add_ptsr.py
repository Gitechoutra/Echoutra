import pandas as pd
from pathlib import Path


def addptsr(app):
    with app.app_context():
        from ..models.projectType import ProjectTypes
        from ..models.mastertasks import MasterTasks
        from ..models.subtask import SubTasks
        from ..models.ptsRelations import PTSRelations

        # Set up logging
        logger = app.logger
        logger.info("Started Adding Project task and subtask relation")
        # Load the Excel file
        pts_file = Path("docs\Project_Tasks_Subtasks.xlsx")
        if not pts_file.exists():
            logger.error(f"File not found: {pts_file}")
            raise FileNotFoundError

        df = pd.read_excel(pts_file)
        if "Project Type" not in df.columns and "Task" not in df.columns and "Sub Task" not in df.columns:
            logger.error(
                f"'Project Type', 'Task', 'Sub Task' column not found in {pts_file}")
            return

        project_types = df["Project Type"].unique()
        pt_data = {}
        for project_type in project_types:
            if str(project_type) not in ['nan', '', "None", None]:
                pt = ProjectTypes.query.filter_by(
                    ProjectType=project_type).first()
                if not pt:
                    pt = ProjectTypes()
                    pt.ProjectType = project_type
                    pt.save()
                pt_data[project_type] = pt.PTID

        tasks = df["Task"].unique()
        tasks_data = {}
        for task in tasks:
            if str(task) not in ['nan', '', "None", None]:
                mt = MasterTasks.query.filter_by(Task=task).first()
                if not mt:
                    mt = MasterTasks()
                    mt.Task = task
                    mt.save()
                tasks_data[task] = mt.MTaskID

        subtasks = df["Sub Task"].unique()

        subtasks_data = {}
        for subtask in subtasks:
            if str(subtask) not in ['nan', '', "None", None]:
                st = SubTasks.query.filter_by(SubTask=subtask).first()
                if not st:
                    st = SubTasks()
                    st.SubTask = subtask
                    st.save()
                subtasks_data[subtask] = st.SubTaskID

        for record in df.to_dict("records"):
            if pt_data.get(record["Project Type"]) and tasks_data.get(record["Task"]):
                ptsr = PTSRelations.query.filter_by(
                    PTID=pt_data[record["Project Type"]], MTaskID=tasks_data[record["Task"]], SubTaskID=subtasks_data.get(record["Sub Task"], '')).first()
                if not ptsr:
                    ptsr = PTSRelations()
                    ptsr.PTID = pt_data[record["Project Type"]]
                    ptsr.MTaskID = tasks_data[record["Task"]]
                    ptsr.SubTaskID = subtasks_data.get(
                        record["Sub Task"], None)
                    ptsr.save()
        logger.info("ProjectType,MasterTask,SubTasks are added")
