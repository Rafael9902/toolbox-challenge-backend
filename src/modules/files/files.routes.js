import { Router } from 'express'

import * as filesController from './files.controller.js'

/**
 * Routes of the files module.
 *
 * @type {import('express').Router}
 */
export const filesRouter = Router()

filesRouter.get('/data', filesController.getFilesData)
filesRouter.get('/health', filesController.getHealth)
