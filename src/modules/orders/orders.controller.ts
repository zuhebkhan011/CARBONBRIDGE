import { Request, Response, NextFunction } from 'express';
import { OrdersService } from './orders.service.js';

export class OrdersController {
  public static async procureFixedPrice(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await OrdersService.procureFixedPrice(
        req.user!.companyId,
        req.user!.userId,
        req.body
      );
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async procureComposite(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await OrdersService.procureComposite(
        req.user!.companyId,
        req.user!.userId,
        req.body
      );
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await OrdersService.getOrders(req.user!.companyId, req.user!.role);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getOrderById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await OrdersService.getOrderById(
        req.params.id,
        req.user!.companyId,
        req.user!.role
      );
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
