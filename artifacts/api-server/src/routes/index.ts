import { Router, type IRouter } from "express";
import healthRouter from "./health";
import varHrRouter from "./var-hr";

const router: IRouter = Router();

router.use(healthRouter);
router.use(varHrRouter);

export default router;
