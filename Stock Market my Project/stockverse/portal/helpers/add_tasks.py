
def addtasks(app):
    with app.app_context():
        from ..models.projects import Projects
        from ..models.tasks import Tasks
        from ..models.ptsRelations import PTSRelations

        # Set up logging
        logger = app.logger
        logger.info("Started Adding Project tasks")
        projects = Projects.query.all()
        for project in projects:
            project_tasks = PTSRelations.query.filter_by(
                PTID=project.PTID).all()
            project_tasks = set([pt.ptsr_mtasks.Task for pt in project_tasks])
            for task in project_tasks:
                temp_task = Tasks.query.filter_by(
                    ProjectID=project.ProjectID, Task=task).first()
                if not temp_task:
                    new_task = Tasks()
                    new_task.ProjectID = project.ProjectID
                    new_task.Task = task
                    new_task.Description = ""
                    new_task.save()
        logger.info("Added Tasks")
