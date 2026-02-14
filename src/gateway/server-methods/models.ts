import type { GatewayRequestHandlers } from "./types.js";
import { resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { buildAllowedModelSet, resolveDefaultModelForAgent } from "../../agents/model-selection.js";
import { loadConfig } from "../../config/config.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateModelsListParams,
} from "../protocol/index.js";

export const modelsHandlers: GatewayRequestHandlers = {
  "models.list": async ({ params, respond, context }) => {
    if (!validateModelsListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid models.list params: ${formatValidationErrors(validateModelsListParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const cfg = loadConfig();
      const catalog = await context.loadGatewayModelCatalog();
      const agentId = resolveDefaultAgentId(cfg);
      const defaultModel = resolveDefaultModelForAgent({ cfg, agentId });
      const allowed = buildAllowedModelSet({
        cfg,
        catalog,
        defaultProvider: defaultModel.provider,
        defaultModel: defaultModel.model,
      });
      // Mark each model with whether it's allowed for session switching
      const models = catalog.map((m) => ({
        ...m,
        allowed: allowed.allowAny || allowed.allowedKeys.has(`${m.provider}/${m.id}`),
      }));
      respond(true, { models, allowAny: allowed.allowAny }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
