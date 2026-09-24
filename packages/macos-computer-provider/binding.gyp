{
	"targets": [
		{
			"target_name": "macos_computer_provider",
			"include_dirs": [
				"<!@(node -p \"require('node-addon-api').include\")"
			],
			"defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
			"conditions": [
				[
					"OS=='mac'",
					{
						"sources": ["src/addon.mm"],
						"xcode_settings": {
							"CLANG_ENABLE_OBJC_ARC": "YES",
							"OTHER_LDFLAGS": [
								"-framework AppKit",
								"-framework ApplicationServices",
								"-framework CoreGraphics",
								"-framework CoreFoundation"
							]
						}
					},
					{
						"sources": ["src/addon_stub.cc"]
					}
				]
			]
		}
	]
}
