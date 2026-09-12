import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const incomingId = req.header('x-request-id');
  const id = incomingId || uuidv4();
  req.id = id;
  res.setHeader('x-request-id', id);
  next();
};
