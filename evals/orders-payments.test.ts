import { gateTests } from "./helpers.js";
import { ordersCases, paymentsCases } from "../src/mastra/evals/orders-payments-evals.js";

gateTests([...ordersCases, ...paymentsCases]);
