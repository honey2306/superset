#include <napi.h>

Napi::Value IsAvailable(const Napi::CallbackInfo& info) {
	return Napi::Boolean::New(info.Env(), false);
}

Napi::Value Unavailable(const Napi::CallbackInfo& info) {
	Napi::Error::New(info.Env(), "Superset macOS Computer Provider is unavailable on this host")
		.ThrowAsJavaScriptException();
	return info.Env().Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
	exports.Set("isAvailable", Napi::Function::New(env, IsAvailable));
	for (const char* name : {
		"listSpaces", "spacesForWindow", "switchSpace", "moveWindowToSpace",
		"windowAction", "appAction", "listDockItems", "dockAction",
		"isDockHidden", "setDockHidden", "saveClipboard", "restoreClipboard"
	}) {
		exports.Set(name, Napi::Function::New(env, Unavailable));
	}
	return exports;
}

NODE_API_MODULE(macos_computer_provider, Init)
