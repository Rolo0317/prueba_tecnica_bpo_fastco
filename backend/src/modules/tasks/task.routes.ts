import { Router } from 'express';
import { withValidation } from '../../middlewares/validate.js';
import type { TaskController } from './task.controller.js';
import {
  addTaskNoteSchemas,
  areaPerformanceSchemas,
  changeTaskStatusSchemas,
  createTaskSchemas,
  listTasksSchemas,
  taskStatsSchemas,
  taskTimelineSchemas,
  updateTaskSchemas,
} from './task.schemas.js';

export function createTaskRouter(controller: TaskController): Router {
  const router = Router();

  router.get('/', withValidation(listTasksSchemas, controller.list));
  router.get('/stats', withValidation(taskStatsSchemas, controller.stats));
  router.get('/stats/by-area', withValidation(areaPerformanceSchemas, controller.statsByArea));
  router.post('/', withValidation(createTaskSchemas, controller.create));
  router.patch('/:id', withValidation(updateTaskSchemas, controller.update));
  router.get('/:id/timeline', withValidation(taskTimelineSchemas, controller.timeline));
  router.post('/:id/notes', withValidation(addTaskNoteSchemas, controller.addNote));
  router.patch('/:id/status', withValidation(changeTaskStatusSchemas, controller.changeStatus));

  return router;
}

export function createTaskStatusRouter(controller: TaskController): Router {
  const router = Router();

  router.get('/', controller.listStatuses);

  return router;
}
