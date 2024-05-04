import init, { fedimint_initialize, fedimint_rpc } from "./fedi_wasm.js";

globalThis.init = init;
globalThis.fedimint_initialize = fedimint_initialize;
globalThis.fedimint_rpc = fedimint_rpc;
globalThis.rpc = new Proxy(fedimint_rpc, {
  get(obj, prop) {
    return async (payload) => {
			let response = await obj(prop, JSON.stringify(payload));
			response = JSON.parse(response);
			if (response.error) {
				throw new Error(response.error);
			}
			return response.result;
		}
  },
});
