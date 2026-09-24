#include <napi.h>

#ifdef __APPLE__

#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <CoreGraphics/CoreGraphics.h>
#import <CoreFoundation/CoreFoundation.h>
#import <dlfcn.h>

#include <algorithm>
#include <cmath>
#include <csignal>
#include <cstdint>
#include <string>
#include <vector>
#include <unistd.h>

namespace {

using CGSConnectionID = uint32_t;
using CGSSpaceID = uint64_t;
constexpr int kCGSSpaceUser = 0;
constexpr int kCGSSpaceFullscreen = 1;
constexpr int kCGSSpaceSystem = 2;
constexpr int kCGSSpaceTiled = 5;
constexpr int kCGSSpaceIncludesCurrent = 1 << 0;
constexpr int kCGSSpaceIncludesOthers = 1 << 1;
constexpr int kCGSSpaceIncludesUser = 1 << 2;
constexpr int kCGSAllSpacesMask =
	kCGSSpaceIncludesUser | kCGSSpaceIncludesOthers | kCGSSpaceIncludesCurrent;

struct SkyLightApi {
	void* handle = nullptr;
	CGSConnectionID (*defaultConnection)() = nullptr;
	CFArrayRef (*copySpaces)(CGSConnectionID, int) = nullptr;
	CFArrayRef (*copySpacesForWindows)(CGSConnectionID, int, CFArrayRef) = nullptr;
	int (*spaceGetType)(CGSConnectionID, CGSSpaceID) = nullptr;
	CGSSpaceID (*getActiveSpace)(CGSConnectionID) = nullptr;
	CFStringRef (*spaceCopyName)(CGSConnectionID, CGSSpaceID) = nullptr;
	CFArrayRef (*spaceCopyOwners)(CGSConnectionID, CGSSpaceID) = nullptr;
	void (*managedDisplaySetCurrentSpace)(CGSConnectionID, CFStringRef, CGSSpaceID) = nullptr;
	void (*addWindowsToSpaces)(CGSConnectionID, CFArrayRef, CFArrayRef) = nullptr;
	void (*removeWindowsFromSpaces)(CGSConnectionID, CFArrayRef, CFArrayRef) = nullptr;
	CFStringRef* mainDisplayIdentifier = nullptr;
};

SkyLightApi& SkyLight() {
	static SkyLightApi api = [] {
		SkyLightApi value;
		value.handle = dlopen(
			"/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight",
			RTLD_LAZY | RTLD_LOCAL);
		void* source = value.handle ? value.handle : RTLD_DEFAULT;
		value.defaultConnection = reinterpret_cast<CGSConnectionID (*)()>(
			dlsym(source, "_CGSDefaultConnection"));
		value.copySpaces = reinterpret_cast<CFArrayRef (*)(CGSConnectionID, int)>(
			dlsym(source, "CGSCopySpaces"));
		value.copySpacesForWindows =
			reinterpret_cast<CFArrayRef (*)(CGSConnectionID, int, CFArrayRef)>(
				dlsym(source, "CGSCopySpacesForWindows"));
		value.spaceGetType = reinterpret_cast<int (*)(CGSConnectionID, CGSSpaceID)>(
			dlsym(source, "CGSSpaceGetType"));
		value.getActiveSpace =
			reinterpret_cast<CGSSpaceID (*)(CGSConnectionID)>(
				dlsym(source, "CGSGetActiveSpace"));
		value.spaceCopyName =
			reinterpret_cast<CFStringRef (*)(CGSConnectionID, CGSSpaceID)>(
				dlsym(source, "CGSSpaceCopyName"));
		value.spaceCopyOwners =
			reinterpret_cast<CFArrayRef (*)(CGSConnectionID, CGSSpaceID)>(
				dlsym(source, "CGSSpaceCopyOwners"));
		value.managedDisplaySetCurrentSpace =
			reinterpret_cast<void (*)(CGSConnectionID, CFStringRef, CGSSpaceID)>(
				dlsym(source, "CGSManagedDisplaySetCurrentSpace"));
		value.addWindowsToSpaces =
			reinterpret_cast<void (*)(CGSConnectionID, CFArrayRef, CFArrayRef)>(
				dlsym(source, "CGSAddWindowsToSpaces"));
		value.removeWindowsFromSpaces =
			reinterpret_cast<void (*)(CGSConnectionID, CFArrayRef, CFArrayRef)>(
				dlsym(source, "CGSRemoveWindowsFromSpaces"));
		value.mainDisplayIdentifier = reinterpret_cast<CFStringRef*>(
			dlsym(source, "kCGSPackagesMainDisplayIdentifier"));
		return value;
	}();
	return api;
}

using AXGetWindowFn = AXError (*)(AXUIElementRef, CGWindowID*);

AXGetWindowFn GetAXWindowResolver() {
	static AXGetWindowFn fn = [] {
		void* symbol = dlsym(RTLD_DEFAULT, "_AXUIElementGetWindow");
		return reinterpret_cast<AXGetWindowFn>(symbol);
	}();
	return fn;
}

Napi::Value Throw(Napi::Env env, const std::string& message) {
	Napi::Error::New(env, message).ThrowAsJavaScriptException();
	return env.Undefined();
}

bool RequireSkyLight(std::string* error) {
	auto& api = SkyLight();
	if (!api.defaultConnection || !api.copySpaces || !api.copySpacesForWindows ||
		!api.spaceGetType || !api.getActiveSpace ||
		!api.managedDisplaySetCurrentSpace || !api.addWindowsToSpaces ||
		!api.removeWindowsFromSpaces || !api.mainDisplayIdentifier ||
		!*api.mainDisplayIdentifier) {
		if (error) *error = "Required macOS Space APIs are unavailable";
		return false;
	}
	return true;
}

bool ParseUInt64String(const Napi::Value& value, uint64_t* output) {
	if (!value.IsString()) return false;
	const std::string text = value.As<Napi::String>().Utf8Value();
	if (text.empty()) return false;
	char* end = nullptr;
	errno = 0;
	unsigned long long parsed = std::strtoull(text.c_str(), &end, 10);
	if (errno != 0 || end == text.c_str() || *end != '\0') return false;
	*output = static_cast<uint64_t>(parsed);
	return true;
}

bool ParsePositiveInt(const Napi::Value& value, int64_t* output) {
	if (!value.IsNumber()) return false;
	double raw = value.As<Napi::Number>().DoubleValue();
	if (!std::isfinite(raw) || raw < 1 || std::floor(raw) != raw) return false;
	*output = static_cast<int64_t>(raw);
	return true;
}

bool CFNumberToUInt64(CFTypeRef value, uint64_t* output) {
	if (!value || CFGetTypeID(value) != CFNumberGetTypeID()) return false;
	int64_t signedValue = 0;
	if (!CFNumberGetValue(
			static_cast<CFNumberRef>(value),
			kCFNumberSInt64Type,
			&signedValue) ||
		signedValue < 0) {
		return false;
	}
	*output = static_cast<uint64_t>(signedValue);
	return true;
}

bool ExtractSpaceID(CFTypeRef value, uint64_t* output) {
	if (CFNumberToUInt64(value, output)) return true;
	if (!value || CFGetTypeID(value) != CFDictionaryGetTypeID()) return false;
	auto dict = static_cast<CFDictionaryRef>(value);
	for (CFStringRef key : {
		CFSTR("ManagedSpaceID"),
		CFSTR("id64"),
		CFSTR("id"),
	}) {
		CFTypeRef candidate = CFDictionaryGetValue(dict, key);
		if (CFNumberToUInt64(candidate, output)) return true;
	}
	return false;
}

std::vector<uint64_t> SpaceIDsForWindow(uint32_t windowId) {
	std::vector<uint64_t> result;
	std::string error;
	if (!RequireSkyLight(&error)) return result;
	auto& api = SkyLight();
	const CGSConnectionID connection = api.defaultConnection();
	NSArray* windows = @[ @(windowId) ];
	CFArrayRef spaces = api.copySpacesForWindows(
		connection,
		kCGSAllSpacesMask,
		(__bridge CFArrayRef)windows);
	if (!spaces) return result;
	const CFIndex count = CFArrayGetCount(spaces);
	for (CFIndex index = 0; index < count; ++index) {
		uint64_t id = 0;
		if (ExtractSpaceID(CFArrayGetValueAtIndex(spaces, index), &id)) {
			result.push_back(id);
		}
	}
	CFRelease(spaces);
	return result;
}

std::vector<uint64_t> AllSpaceIDs() {
	std::vector<uint64_t> result;
	std::string error;
	if (!RequireSkyLight(&error)) return result;
	auto& api = SkyLight();
	CFArrayRef spaces = api.copySpaces(api.defaultConnection(), kCGSAllSpacesMask);
	if (!spaces) return result;
	const CFIndex count = CFArrayGetCount(spaces);
	for (CFIndex index = 0; index < count; ++index) {
		uint64_t id = 0;
		if (ExtractSpaceID(CFArrayGetValueAtIndex(spaces, index), &id)) {
			result.push_back(id);
		}
	}
	CFRelease(spaces);
	return result;
}

bool Contains(const std::vector<uint64_t>& values, uint64_t value) {
	return std::find(values.begin(), values.end(), value) != values.end();
}

Napi::Array UInt64Strings(Napi::Env env, const std::vector<uint64_t>& values) {
	Napi::Array array = Napi::Array::New(env, values.size());
	for (size_t index = 0; index < values.size(); ++index) {
		array.Set(
			static_cast<uint32_t>(index),
			Napi::String::New(env, std::to_string(values[index])));
	}
	return array;
}

const char* SpaceTypeName(int type) {
	switch (type) {
	case kCGSSpaceUser:
		return "user";
	case kCGSSpaceFullscreen:
		return "fullscreen";
	case kCGSSpaceSystem:
		return "system";
	case kCGSSpaceTiled:
		return "tiled";
	default:
		return "unknown";
	}
}

std::string CFStringToStd(CFStringRef value) {
	if (!value) return {};
	CFIndex length = CFStringGetLength(value);
	CFIndex maxSize = CFStringGetMaximumSizeForEncoding(
		length,
		kCFStringEncodingUTF8) + 1;
	std::vector<char> buffer(static_cast<size_t>(maxSize));
	if (!CFStringGetCString(
			value,
			buffer.data(),
			maxSize,
			kCFStringEncodingUTF8)) {
		return {};
	}
	return std::string(buffer.data());
}

Napi::Value IsAvailable(const Napi::CallbackInfo& info) {
	std::string error;
	return Napi::Boolean::New(
		info.Env(),
		RequireSkyLight(&error) && GetAXWindowResolver() != nullptr);
}

Napi::Value ListSpaces(const Napi::CallbackInfo& info) {
	Napi::Env env = info.Env();
	std::string error;
	if (!RequireSkyLight(&error)) return Throw(env, error);
	auto& api = SkyLight();
	const CGSConnectionID connection = api.defaultConnection();
	CFArrayRef spaces = api.copySpaces(connection, kCGSAllSpacesMask);
	if (!spaces) return Throw(env, "macOS returned no Space inventory");
	const CGSSpaceID active = api.getActiveSpace(connection);
	Napi::Array output = Napi::Array::New(
		env,
		static_cast<size_t>(CFArrayGetCount(spaces)));
	uint32_t outputIndex = 0;
	for (CFIndex index = 0; index < CFArrayGetCount(spaces); ++index) {
		uint64_t id = 0;
		if (!ExtractSpaceID(CFArrayGetValueAtIndex(spaces, index), &id)) continue;
		Napi::Object item = Napi::Object::New(env);
		item.Set("number", Napi::Number::New(env, outputIndex + 1));
		item.Set("id", Napi::String::New(env, std::to_string(id)));
		item.Set("type", Napi::String::New(env, SpaceTypeName(api.spaceGetType(connection, id))));
		item.Set("isActive", Napi::Boolean::New(env, id == active));

		if (api.spaceCopyName) {
			CFStringRef name = api.spaceCopyName(connection, id);
			if (name) {
				const std::string stringName = CFStringToStd(name);
				if (!stringName.empty()) {
					item.Set("name", Napi::String::New(env, stringName));
				}
				CFRelease(name);
			}
		}
		Napi::Array owners = Napi::Array::New(env);
		if (api.spaceCopyOwners) {
			CFArrayRef ownerArray = api.spaceCopyOwners(connection, id);
			if (ownerArray) {
				uint32_t ownerIndex = 0;
				for (CFIndex owner = 0; owner < CFArrayGetCount(ownerArray); ++owner) {
					uint64_t pid = 0;
					if (CFNumberToUInt64(CFArrayGetValueAtIndex(ownerArray, owner), &pid)) {
						owners.Set(ownerIndex++, Napi::Number::New(env, static_cast<double>(pid)));
					}
				}
				CFRelease(ownerArray);
			}
		}
		item.Set("ownerPids", owners);
		output.Set(outputIndex++, item);
	}
	CFRelease(spaces);
	if (outputIndex != output.Length()) {
		Napi::Array compact = Napi::Array::New(env, outputIndex);
		for (uint32_t index = 0; index < outputIndex; ++index) {
			compact.Set(index, output.Get(index));
		}
		return compact;
	}
	return output;
}

Napi::Value SpacesForWindow(const Napi::CallbackInfo& info) {
	Napi::Env env = info.Env();
	if (info.Length() < 1) return Throw(env, "windowId is required");
	int64_t windowId = 0;
	if (!ParsePositiveInt(info[0], &windowId) ||
		windowId > std::numeric_limits<uint32_t>::max()) {
		return Throw(env, "windowId must be a positive 32-bit integer");
	}
	return UInt64Strings(env, SpaceIDsForWindow(static_cast<uint32_t>(windowId)));
}

Napi::Value SwitchSpace(const Napi::CallbackInfo& info) {
	Napi::Env env = info.Env();
	if (info.Length() < 1) return Throw(env, "spaceId is required");
	uint64_t target = 0;
	if (!ParseUInt64String(info[0], &target)) {
		return Throw(env, "spaceId must be an unsigned integer string");
	}
	std::string error;
	if (!RequireSkyLight(&error)) return Throw(env, error);
	const auto spaces = AllSpaceIDs();
	if (!Contains(spaces, target)) return Throw(env, "Target Space does not exist");

	auto& api = SkyLight();
	const CGSConnectionID connection = api.defaultConnection();
	const uint64_t before = api.getActiveSpace(connection);
	bool dispatched = false;
	if (before != target) {
		api.managedDisplaySetCurrentSpace(
			connection,
			*api.mainDisplayIdentifier,
			target);
		dispatched = true;
		usleep(300000);
	}
	const uint64_t after = api.getActiveSpace(connection);
	Napi::Object result = Napi::Object::New(env);
	result.Set("dispatched", Napi::Boolean::New(env, dispatched));
	result.Set("changed", Napi::Boolean::New(env, before != after));
	result.Set("confirmed", Napi::Boolean::New(env, after == target));
	result.Set("before", Napi::String::New(env, std::to_string(before)));
	result.Set("after", Napi::String::New(env, std::to_string(after)));
	return result;
}

Napi::Value MoveWindowToSpace(const Napi::CallbackInfo& info) {
	Napi::Env env = info.Env();
	if (info.Length() < 2) return Throw(env, "windowId and spaceId are required");
	int64_t windowIdValue = 0;
	uint64_t target = 0;
	if (!ParsePositiveInt(info[0], &windowIdValue) ||
		windowIdValue > std::numeric_limits<uint32_t>::max()) {
		return Throw(env, "windowId must be a positive 32-bit integer");
	}
	if (!ParseUInt64String(info[1], &target)) {
		return Throw(env, "spaceId must be an unsigned integer string");
	}
	const uint32_t windowId = static_cast<uint32_t>(windowIdValue);
	std::string error;
	if (!RequireSkyLight(&error)) return Throw(env, error);
	if (!Contains(AllSpaceIDs(), target)) return Throw(env, "Target Space does not exist");

	const auto before = SpaceIDsForWindow(windowId);
	if (before.size() == 1 && before.front() == target) {
		Napi::Object result = Napi::Object::New(env);
		result.Set("dispatched", Napi::Boolean::New(env, false));
		result.Set("changed", Napi::Boolean::New(env, false));
		result.Set("confirmed", Napi::Boolean::New(env, true));
		result.Set("before", UInt64Strings(env, before));
		result.Set("after", UInt64Strings(env, before));
		return result;
	}

	auto& api = SkyLight();
	const CGSConnectionID connection = api.defaultConnection();
	NSArray* windows = @[ @(windowId) ];
	NSArray* targetSpaces = @[ @(target) ];
	api.addWindowsToSpaces(
		connection,
		(__bridge CFArrayRef)windows,
		(__bridge CFArrayRef)targetSpaces);
	usleep(100000);
	const auto added = SpaceIDsForWindow(windowId);
	if (!Contains(added, target)) {
		return Throw(env, "Window was not added to the target Space");
	}

	std::vector<uint64_t> sources;
	for (uint64_t source : added) {
		if (source != target) sources.push_back(source);
	}
	if (!sources.empty()) {
		NSMutableArray* sourceSpaces =
			[NSMutableArray arrayWithCapacity:sources.size()];
		for (uint64_t source : sources) {
			[sourceSpaces addObject:@(source)];
		}
		api.removeWindowsFromSpaces(
			connection,
			(__bridge CFArrayRef)windows,
			(__bridge CFArrayRef)sourceSpaces);
	}
	usleep(100000);
	const auto after = SpaceIDsForWindow(windowId);
	const bool confirmed =
		after.size() == 1 && after.front() == target;
	Napi::Object result = Napi::Object::New(env);
	result.Set("dispatched", Napi::Boolean::New(env, true));
	result.Set("changed", Napi::Boolean::New(env, before != after));
	result.Set("confirmed", Napi::Boolean::New(env, confirmed));
	result.Set("before", UInt64Strings(env, before));
	result.Set("after", UInt64Strings(env, after));
	return result;
}

AXUIElementRef CopyExactWindow(pid_t pid, CGWindowID windowId) {
	AXGetWindowFn resolver = GetAXWindowResolver();
	if (!resolver) return nullptr;
	AXUIElementRef app = AXUIElementCreateApplication(pid);
	if (!app) return nullptr;
	AXUIElementSetMessagingTimeout(app, 1.0);
	CFTypeRef rawWindows = nullptr;
	AXError error = AXUIElementCopyAttributeValue(
		app,
		kAXWindowsAttribute,
		&rawWindows);
	CFRelease(app);
	if (error != kAXErrorSuccess || !rawWindows ||
		CFGetTypeID(rawWindows) != CFArrayGetTypeID()) {
		if (rawWindows) CFRelease(rawWindows);
		return nullptr;
	}
	CFArrayRef windows = static_cast<CFArrayRef>(rawWindows);
	AXUIElementRef matched = nullptr;
	for (CFIndex index = 0; index < CFArrayGetCount(windows); ++index) {
		AXUIElementRef window = static_cast<AXUIElementRef>(
			const_cast<void*>(CFArrayGetValueAtIndex(windows, index)));
		CGWindowID candidate = 0;
		if (resolver(window, &candidate) == kAXErrorSuccess &&
			candidate == windowId) {
			matched = static_cast<AXUIElementRef>(CFRetain(window));
			break;
		}
	}
	CFRelease(windows);
	return matched;
}

bool CopyAXBool(AXUIElementRef element, CFStringRef attribute, bool* output) {
	CFTypeRef value = nullptr;
	if (AXUIElementCopyAttributeValue(element, attribute, &value) !=
			kAXErrorSuccess ||
		!value) {
		return false;
	}
	bool ok = CFGetTypeID(value) == CFBooleanGetTypeID();
	if (ok) *output = CFBooleanGetValue(static_cast<CFBooleanRef>(value));
	CFRelease(value);
	return ok;
}

bool CopyAXPoint(AXUIElementRef element, CGPoint* output) {
	CFTypeRef value = nullptr;
	if (AXUIElementCopyAttributeValue(element, kAXPositionAttribute, &value) !=
			kAXErrorSuccess ||
		!value ||
		CFGetTypeID(value) != AXValueGetTypeID()) {
		if (value) CFRelease(value);
		return false;
	}
	bool ok = AXValueGetType(static_cast<AXValueRef>(value)) ==
			static_cast<AXValueType>(kAXValueCGPointType) &&
		AXValueGetValue(
			static_cast<AXValueRef>(value),
			static_cast<AXValueType>(kAXValueCGPointType),
			output);
	CFRelease(value);
	return ok;
}

bool CopyAXSize(AXUIElementRef element, CGSize* output) {
	CFTypeRef value = nullptr;
	if (AXUIElementCopyAttributeValue(element, kAXSizeAttribute, &value) !=
			kAXErrorSuccess ||
		!value ||
		CFGetTypeID(value) != AXValueGetTypeID()) {
		if (value) CFRelease(value);
		return false;
	}
	bool ok = AXValueGetType(static_cast<AXValueRef>(value)) ==
			static_cast<AXValueType>(kAXValueCGSizeType) &&
		AXValueGetValue(
			static_cast<AXValueRef>(value),
			static_cast<AXValueType>(kAXValueCGSizeType),
			output);
	CFRelease(value);
	return ok;
}

bool SetAXPoint(AXUIElementRef element, CGPoint point) {
	AXValueRef value = AXValueCreate(
		static_cast<AXValueType>(kAXValueCGPointType),
		&point);
	if (!value) return false;
	AXError error = AXUIElementSetAttributeValue(element, kAXPositionAttribute, value);
	CFRelease(value);
	return error == kAXErrorSuccess;
}

bool SetAXSize(AXUIElementRef element, CGSize size) {
	AXValueRef value = AXValueCreate(
		static_cast<AXValueType>(kAXValueCGSizeType),
		&size);
	if (!value) return false;
	AXError error = AXUIElementSetAttributeValue(element, kAXSizeAttribute, value);
	CFRelease(value);
	return error == kAXErrorSuccess;
}

NSScreen* ScreenForAXRect(CGRect rect) {
	CGPoint center = CGPointMake(CGRectGetMidX(rect), CGRectGetMidY(rect));
	NSScreen* best = nil;
	double bestArea = -1;
	for (NSScreen* screen in NSScreen.screens) {
		NSNumber* number = screen.deviceDescription[@"NSScreenNumber"];
		if (!number) continue;
		CGRect bounds = CGDisplayBounds(number.unsignedIntValue);
		if (CGRectContainsPoint(bounds, center)) return screen;
		CGRect intersection = CGRectIntersection(bounds, rect);
		double area = CGRectIsNull(intersection)
			? 0
			: intersection.size.width * intersection.size.height;
		if (area > bestArea) {
			bestArea = area;
			best = screen;
		}
	}
	return best ?: NSScreen.mainScreen;
}

bool VisibleFrameForAXRect(CGRect current, CGRect* output) {
	NSScreen* screen = ScreenForAXRect(current);
	if (!screen) return false;
	NSNumber* number = screen.deviceDescription[@"NSScreenNumber"];
	if (!number) return false;
	CGRect display = CGDisplayBounds(number.unsignedIntValue);
	NSRect frame = screen.frame;
	NSRect visible = screen.visibleFrame;
	const double left = NSMinX(visible) - NSMinX(frame);
	const double right = NSMaxX(frame) - NSMaxX(visible);
	const double bottom = NSMinY(visible) - NSMinY(frame);
	const double top = NSMaxY(frame) - NSMaxY(visible);
	*output = CGRectMake(
		display.origin.x + left,
		display.origin.y + top,
		std::max(1.0, display.size.width - left - right),
		std::max(1.0, display.size.height - top - bottom));
	return true;
}

bool RectClose(CGRect a, CGRect b, double tolerance = 2.0) {
	return std::abs(a.origin.x - b.origin.x) <= tolerance &&
		std::abs(a.origin.y - b.origin.y) <= tolerance &&
		std::abs(a.size.width - b.size.width) <= tolerance &&
		std::abs(a.size.height - b.size.height) <= tolerance;
}

Napi::Value WindowAction(const Napi::CallbackInfo& info) {
	Napi::Env env = info.Env();
	if (info.Length() < 3 || !info[2].IsString()) {
		return Throw(env, "pid, windowId, and action are required");
	}
	int64_t pidValue = 0;
	int64_t windowIdValue = 0;
	if (!ParsePositiveInt(info[0], &pidValue) ||
		pidValue > std::numeric_limits<int32_t>::max()) {
		return Throw(env, "pid must be a positive 32-bit integer");
	}
	if (!ParsePositiveInt(info[1], &windowIdValue) ||
		windowIdValue > std::numeric_limits<uint32_t>::max()) {
		return Throw(env, "windowId must be a positive 32-bit integer");
	}
	const pid_t pid = static_cast<pid_t>(pidValue);
	const CGWindowID windowId = static_cast<CGWindowID>(windowIdValue);
	const std::string action = info[2].As<Napi::String>().Utf8Value();
	AXUIElementRef window = CopyExactWindow(pid, windowId);
	if (!window) return Throw(env, "Exact accessibility window is unavailable");
	AXUIElementSetMessagingTimeout(window, 1.0);

	bool dispatched = false;
	bool confirmed = false;
	if (action == "minimize" || action == "restore") {
		const bool target = action == "minimize";
		bool before = false;
		if (!CopyAXBool(window, kAXMinimizedAttribute, &before)) {
			CFRelease(window);
			return Throw(env, "Window minimized state is unavailable");
		}
		if (before == target) {
			dispatched = false;
			confirmed = true;
		} else {
			dispatched =
				AXUIElementSetAttributeValue(
					window,
					kAXMinimizedAttribute,
					target ? kCFBooleanTrue : kCFBooleanFalse) == kAXErrorSuccess;
			if (dispatched) {
				usleep(120000);
				bool after = false;
				confirmed =
					CopyAXBool(window, kAXMinimizedAttribute, &after) &&
					after == target;
			}
		}
	} else if (action == "close") {
		AXError closeError =
			AXUIElementPerformAction(window, CFSTR("AXClose"));
		if (closeError != kAXErrorSuccess) {
			CFTypeRef closeButton = nullptr;
			if (AXUIElementCopyAttributeValue(
					window,
					kAXCloseButtonAttribute,
					&closeButton) == kAXErrorSuccess &&
				closeButton &&
				CFGetTypeID(closeButton) == AXUIElementGetTypeID()) {
				closeError = AXUIElementPerformAction(
					static_cast<AXUIElementRef>(closeButton),
					kAXPressAction);
			}
			if (closeButton) CFRelease(closeButton);
		}
		dispatched = closeError == kAXErrorSuccess;
		if (dispatched) {
			usleep(150000);
			AXUIElementRef after = CopyExactWindow(pid, windowId);
			confirmed = after == nullptr;
			if (after) CFRelease(after);
		}
	} else if (action == "maximize") {
		CGPoint beforePosition;
		CGSize beforeSize;
		if (!CopyAXPoint(window, &beforePosition) ||
			!CopyAXSize(window, &beforeSize)) {
			CFRelease(window);
			return Throw(env, "Window geometry is unavailable");
		}
		CGRect current = CGRectMake(
			beforePosition.x,
			beforePosition.y,
			beforeSize.width,
			beforeSize.height);
		CGRect target;
		if (!VisibleFrameForAXRect(current, &target)) {
			CFRelease(window);
			return Throw(env, "No display is available for window maximize");
		}
		if (RectClose(current, target)) {
			confirmed = true;
		} else {
			dispatched =
				SetAXPoint(window, target.origin) &&
				SetAXSize(window, target.size);
			if (dispatched) {
				usleep(120000);
				CGPoint afterPosition;
				CGSize afterSize;
				confirmed =
					CopyAXPoint(window, &afterPosition) &&
					CopyAXSize(window, &afterSize) &&
					RectClose(
						CGRectMake(
							afterPosition.x,
							afterPosition.y,
							afterSize.width,
							afterSize.height),
						target);
			}
		}
	} else {
		CFRelease(window);
		return Throw(env, "Unsupported window action");
	}
	CFRelease(window);
	if (dispatched && !confirmed) {
		Napi::Object partial = Napi::Object::New(env);
		partial.Set("dispatched", Napi::Boolean::New(env, true));
		partial.Set("changed", Napi::Boolean::New(env, true));
		partial.Set("confirmed", Napi::Boolean::New(env, false));
		return partial;
	}
	Napi::Object result = Napi::Object::New(env);
	result.Set("dispatched", Napi::Boolean::New(env, dispatched));
	result.Set("changed", Napi::Boolean::New(env, dispatched));
	result.Set("confirmed", Napi::Boolean::New(env, confirmed));
	return result;
}

Napi::Value AppAction(const Napi::CallbackInfo& info) {
	Napi::Env env = info.Env();
	if (info.Length() < 2 || !info[1].IsString()) {
		return Throw(env, "pid and action are required");
	}
	int64_t pidValue = 0;
	if (!ParsePositiveInt(info[0], &pidValue) ||
		pidValue > std::numeric_limits<int32_t>::max()) {
		return Throw(env, "pid must be a positive 32-bit integer");
	}
	NSRunningApplication* app =
		[NSRunningApplication
			runningApplicationWithProcessIdentifier:static_cast<pid_t>(pidValue)];
	if (!app) return Throw(env, "Application is no longer running");
	const std::string action = info[1].As<Napi::String>().Utf8Value();
	bool ok = false;
	if (action == "terminate") {
		ok = [app terminate];
	} else if (action == "force-terminate") {
		ok = [app forceTerminate];
	} else if (action == "hide") {
		ok = [app hide];
	} else if (action == "unhide") {
		ok = [app unhide];
	} else if (action == "activate") {
		ok = [app activateWithOptions:NSApplicationActivateIgnoringOtherApps];
	} else {
		return Throw(env, "Unsupported application action");
	}
	Napi::Object result = Napi::Object::New(env);
	result.Set("dispatched", Napi::Boolean::New(env, ok));
	result.Set("changed", Napi::Boolean::New(env, ok));
	result.Set("confirmed", Napi::Boolean::New(env, ok));
	return result;
}

AXUIElementRef CopyAXApplication(pid_t pid) {
	AXUIElementRef app = AXUIElementCreateApplication(pid);
	if (app) AXUIElementSetMessagingTimeout(app, 1.0);
	return app;
}

std::string CopyAXString(AXUIElementRef element, CFStringRef attribute) {
	CFTypeRef value = nullptr;
	if (AXUIElementCopyAttributeValue(element, attribute, &value) !=
			kAXErrorSuccess ||
		!value) {
		return {};
	}
	std::string output;
	if (CFGetTypeID(value) == CFStringGetTypeID()) {
		output = CFStringToStd(static_cast<CFStringRef>(value));
	}
	CFRelease(value);
	return output;
}

bool CopyAXChildren(AXUIElementRef element, CFArrayRef* output) {
	CFTypeRef value = nullptr;
	if (AXUIElementCopyAttributeValue(element, kAXChildrenAttribute, &value) !=
			kAXErrorSuccess ||
		!value ||
		CFGetTypeID(value) != CFArrayGetTypeID()) {
		if (value) CFRelease(value);
		return false;
	}
	*output = static_cast<CFArrayRef>(value);
	return true;
}

AXUIElementRef CopyFirstRole(
	AXUIElementRef root,
	const std::string& role,
	int depth) {
	if (!root || depth < 0) return nullptr;
	if (CopyAXString(root, kAXRoleAttribute) == role) {
		return static_cast<AXUIElementRef>(CFRetain(root));
	}
	CFArrayRef children = nullptr;
	if (!CopyAXChildren(root, &children)) return nullptr;
	AXUIElementRef found = nullptr;
	for (CFIndex index = 0;
		index < CFArrayGetCount(children) && !found;
		++index) {
		AXUIElementRef child = static_cast<AXUIElementRef>(
			const_cast<void*>(CFArrayGetValueAtIndex(children, index)));
		found = CopyFirstRole(child, role, depth - 1);
	}
	CFRelease(children);
	return found;
}

NSRunningApplication* DockApplication() {
	return [NSRunningApplication
		runningApplicationsWithBundleIdentifier:@"com.apple.dock"].firstObject;
}

AXUIElementRef CopyDockList() {
	NSRunningApplication* dock = DockApplication();
	if (!dock) return nullptr;
	AXUIElementRef app = CopyAXApplication(dock.processIdentifier);
	if (!app) return nullptr;
	AXUIElementRef list = CopyFirstRole(app, "AXList", 6);
	CFRelease(app);
	return list;
}

bool CopyAXBoolAttribute(
	AXUIElementRef element,
	CFStringRef attribute,
	bool* output) {
	return CopyAXBool(element, attribute, output);
}

bool CopyAXFrame(
	AXUIElementRef element,
	CGPoint* position,
	CGSize* size) {
	return CopyAXPoint(element, position) && CopyAXSize(element, size);
}

std::string DockType(
	const std::string& role,
	const std::string& subrole,
	const std::string& title) {
	if (role == "AXSeparator" || subrole == "AXSeparator") return "separator";
	if (subrole == "AXApplicationDockItem") return "application";
	if (subrole == "AXFolderDockItem") return "folder";
	if (subrole == "AXFileDockItem") return "file";
	if (subrole == "AXURLDockItem") return "url";
	if (subrole == "AXMinimizedWindowDockItem") return "minimized-window";
	std::string normalized = title;
	std::transform(
		normalized.begin(),
		normalized.end(),
		normalized.begin(),
		[](unsigned char c) { return static_cast<char>(std::tolower(c)); });
	if (normalized == "trash" || normalized == "bin") return "trash";
	return "unknown";
}

Napi::Value ListDockItems(const Napi::CallbackInfo& info) {
	Napi::Env env = info.Env();
	const bool includeAll =
		info.Length() > 0 && info[0].IsBoolean() &&
		info[0].As<Napi::Boolean>().Value();
	AXUIElementRef list = CopyDockList();
	if (!list) return Throw(env, "Dock accessibility list is unavailable");
	CFArrayRef children = nullptr;
	if (!CopyAXChildren(list, &children)) {
		CFRelease(list);
		return Throw(env, "Dock item list is unavailable");
	}
	Napi::Array output = Napi::Array::New(env);
	uint32_t outputIndex = 0;
	for (CFIndex index = 0; index < CFArrayGetCount(children); ++index) {
		AXUIElementRef item = static_cast<AXUIElementRef>(
			const_cast<void*>(CFArrayGetValueAtIndex(children, index)));
		const std::string role = CopyAXString(item, kAXRoleAttribute);
		const std::string subrole = CopyAXString(item, kAXSubroleAttribute);
		const std::string title = CopyAXString(item, kAXTitleAttribute);
		const std::string type = DockType(role, subrole, title);
		if (!includeAll && type == "separator") continue;

		Napi::Object value = Napi::Object::New(env);
		value.Set("index", Napi::Number::New(env, static_cast<double>(index)));
		value.Set("title", Napi::String::New(env, title));
		if (!role.empty()) value.Set("role", Napi::String::New(env, role));
		if (!subrole.empty()) value.Set("subrole", Napi::String::New(env, subrole));
		value.Set("type", Napi::String::New(env, type));
		bool running = false;
		if (CopyAXBoolAttribute(
				item,
				CFSTR("AXIsApplicationRunning"),
				&running)) {
			value.Set("isRunning", Napi::Boolean::New(env, running));
		}
		CGPoint position;
		CGSize size;
		if (CopyAXFrame(item, &position, &size)) {
			value.Set("x", Napi::Number::New(env, position.x));
			value.Set("y", Napi::Number::New(env, position.y));
			value.Set("width", Napi::Number::New(env, size.width));
			value.Set("height", Napi::Number::New(env, size.height));
		}
		output.Set(outputIndex++, value);
	}
	CFRelease(children);
	CFRelease(list);
	return output;
}

AXUIElementRef CopyDockItemByName(
	const std::string& requested,
	std::string* error) {
	AXUIElementRef list = CopyDockList();
	if (!list) {
		if (error) *error = "Dock accessibility list is unavailable";
		return nullptr;
	}
	CFArrayRef children = nullptr;
	if (!CopyAXChildren(list, &children)) {
		CFRelease(list);
		if (error) *error = "Dock item list is unavailable";
		return nullptr;
	}
	std::vector<AXUIElementRef> exact;
	std::vector<AXUIElementRef> folded;
	NSString* requestedNS =
		[NSString stringWithUTF8String:requested.c_str()];
	for (CFIndex index = 0; index < CFArrayGetCount(children); ++index) {
		AXUIElementRef item = static_cast<AXUIElementRef>(
			const_cast<void*>(CFArrayGetValueAtIndex(children, index)));
		std::string title = CopyAXString(item, kAXTitleAttribute);
		if (title.empty()) continue;
		if (title == requested) exact.push_back(item);
		NSString* titleNS = [NSString stringWithUTF8String:title.c_str()];
		if ([titleNS caseInsensitiveCompare:requestedNS] == NSOrderedSame) {
			folded.push_back(item);
		}
	}
	AXUIElementRef result = nullptr;
	const auto& candidates = exact.empty() ? folded : exact;
	if (candidates.size() == 1) {
		result = static_cast<AXUIElementRef>(CFRetain(candidates.front()));
	} else if (error) {
		*error = candidates.empty()
			? "Dock item was not found"
			: "Dock item selector is ambiguous";
	}
	CFRelease(children);
	CFRelease(list);
	return result;
}

AXUIElementRef CopyDescendantByRoleAndTitle(
	AXUIElementRef root,
	const std::string& role,
	const std::string& requested,
	int depth,
	int* matches) {
	if (!root || depth < 0) return nullptr;
	AXUIElementRef found = nullptr;
	const std::string currentRole = CopyAXString(root, kAXRoleAttribute);
	if (currentRole == role) {
		const std::string title = CopyAXString(root, kAXTitleAttribute);
		NSString* titleNS = [NSString stringWithUTF8String:title.c_str()];
		NSString* requestedNS =
			[NSString stringWithUTF8String:requested.c_str()];
		if (title == requested ||
			[titleNS caseInsensitiveCompare:requestedNS] == NSOrderedSame) {
			++(*matches);
			if (*matches == 1) {
				found = static_cast<AXUIElementRef>(CFRetain(root));
			}
		}
	}
	CFArrayRef children = nullptr;
	if (CopyAXChildren(root, &children)) {
		for (CFIndex index = 0; index < CFArrayGetCount(children); ++index) {
			AXUIElementRef child = static_cast<AXUIElementRef>(
				const_cast<void*>(CFArrayGetValueAtIndex(children, index)));
			AXUIElementRef childResult =
				CopyDescendantByRoleAndTitle(
					child,
					role,
					requested,
					depth - 1,
					matches);
			if (childResult) {
				if (!found) {
					found = childResult;
				} else {
					CFRelease(childResult);
				}
			}
		}
		CFRelease(children);
	}
	return found;
}

Napi::Value DockAction(const Napi::CallbackInfo& info) {
	Napi::Env env = info.Env();
	if (info.Length() < 2 ||
		!info[0].IsString() ||
		!info[1].IsString()) {
		return Throw(env, "Dock name and action are required");
	}
	const std::string name = info[0].As<Napi::String>().Utf8Value();
	const std::string action = info[1].As<Napi::String>().Utf8Value();
	std::string error;
	AXUIElementRef item = CopyDockItemByName(name, &error);
	if (!item) return Throw(env, error);
	AXError dispatch = kAXErrorFailure;
	if (action == "launch") {
		dispatch = AXUIElementPerformAction(item, kAXPressAction);
	} else if (action == "show-menu") {
		CGPoint position;
		CGSize size;
		if (!CopyAXFrame(item, &position, &size)) {
			CFRelease(item);
			return Throw(env, "Dock item geometry is unavailable");
		}
		const CGPoint center = CGPointMake(
			position.x + size.width / 2.0,
			position.y + size.height / 2.0);
		CGEventRef down = CGEventCreateMouseEvent(
			nullptr,
			kCGEventRightMouseDown,
			center,
			kCGMouseButtonRight);
		CGEventRef up = CGEventCreateMouseEvent(
			nullptr,
			kCGEventRightMouseUp,
			center,
			kCGMouseButtonRight);
		if (!down || !up) {
			if (down) CFRelease(down);
			if (up) CFRelease(up);
			CFRelease(item);
			return Throw(env, "Could not construct Dock right-click events");
		}
		CGEventPost(kCGHIDEventTap, down);
		CGEventPost(kCGHIDEventTap, up);
		CFRelease(down);
		CFRelease(up);
		dispatch = kAXErrorSuccess;
		if (info.Length() > 2 &&
			info[2].IsString() &&
			!info[2].As<Napi::String>().Utf8Value().empty()) {
			const std::string menuItem =
				info[2].As<Napi::String>().Utf8Value();
			usleep(100000);
			NSRunningApplication* dock = DockApplication();
			AXUIElementRef app =
				dock ? CopyAXApplication(dock.processIdentifier) : nullptr;
			if (!app) {
				CFRelease(item);
				return Throw(env, "Dock context menu is unavailable");
			}
			int matches = 0;
			AXUIElementRef menu =
				CopyDescendantByRoleAndTitle(
					app,
					"AXMenuItem",
					menuItem,
					10,
					&matches);
			CFRelease(app);
			if (!menu || matches != 1) {
				if (menu) CFRelease(menu);
				CFRelease(item);
				return Throw(
					env,
					matches > 1
						? "Dock context-menu item is ambiguous"
						: "Dock context-menu item was not found");
			}
			dispatch = AXUIElementPerformAction(menu, kAXPressAction);
			CFRelease(menu);
		}
	} else {
		CFRelease(item);
		return Throw(env, "Unsupported Dock action");
	}
	CFRelease(item);
	const bool ok = dispatch == kAXErrorSuccess;
	Napi::Object result = Napi::Object::New(env);
	result.Set("dispatched", Napi::Boolean::New(env, ok));
	result.Set("changed", Napi::Boolean::New(env, ok));
	result.Set("confirmed", Napi::Boolean::New(env, false));
	return result;
}

bool ReadDockHidden(bool* output) {
	CFPropertyListRef value =
		CFPreferencesCopyAppValue(
			CFSTR("autohide"),
			CFSTR("com.apple.dock"));
	if (!value) {
		*output = false;
		return true;
	}
	bool ok = false;
	if (CFGetTypeID(value) == CFBooleanGetTypeID()) {
		*output = CFBooleanGetValue(static_cast<CFBooleanRef>(value));
		ok = true;
	} else if (CFGetTypeID(value) == CFNumberGetTypeID()) {
		int number = 0;
		ok = CFNumberGetValue(
			static_cast<CFNumberRef>(value),
			kCFNumberIntType,
			&number);
		*output = number != 0;
	}
	CFRelease(value);
	return ok;
}

Napi::Value IsDockHidden(const Napi::CallbackInfo& info) {
	bool hidden = false;
	if (!ReadDockHidden(&hidden)) {
		return Throw(info.Env(), "Dock autohide preference is unreadable");
	}
	return Napi::Boolean::New(info.Env(), hidden);
}

Napi::Value SetDockHidden(const Napi::CallbackInfo& info) {
	Napi::Env env = info.Env();
	if (info.Length() < 1 || !info[0].IsBoolean()) {
		return Throw(env, "hidden must be a boolean");
	}
	const bool target = info[0].As<Napi::Boolean>().Value();
	bool before = false;
	if (!ReadDockHidden(&before)) {
		return Throw(env, "Dock autohide preference is unreadable");
	}
	bool dispatched = false;
	if (before != target) {
		CFPreferencesSetAppValue(
			CFSTR("autohide"),
			target ? kCFBooleanTrue : kCFBooleanFalse,
			CFSTR("com.apple.dock"));
		if (!CFPreferencesAppSynchronize(CFSTR("com.apple.dock"))) {
			return Throw(env, "Dock autohide preference could not be synchronized");
		}
		dispatched = true;
		NSRunningApplication* dock = DockApplication();
		if (dock) kill(dock.processIdentifier, SIGTERM);
		usleep(150000);
	}
	bool after = false;
	const bool readable = ReadDockHidden(&after);
	Napi::Object result = Napi::Object::New(env);
	result.Set("dispatched", Napi::Boolean::New(env, dispatched));
	result.Set("changed", Napi::Boolean::New(env, before != after));
	result.Set(
		"confirmed",
		Napi::Boolean::New(env, readable && after == target));
	result.Set("before", Napi::Boolean::New(env, before));
	result.Set("after", Napi::Boolean::New(env, after));
	return result;
}

NSMutableDictionary<NSString*, NSArray<NSPasteboardItem*>*>*
ClipboardSnapshots() {
	static NSMutableDictionary<NSString*, NSArray<NSPasteboardItem*>*>*
		snapshots = [NSMutableDictionary dictionary];
	return snapshots;
}

Napi::Value SaveClipboard(const Napi::CallbackInfo& info) {
	Napi::Env env = info.Env();
	NSPasteboard* pasteboard = NSPasteboard.generalPasteboard;
	NSMutableArray<NSPasteboardItem*>* copies = [NSMutableArray array];
	for (NSPasteboardItem* source in pasteboard.pasteboardItems ?: @[]) {
		NSPasteboardItem* copy = [[NSPasteboardItem alloc] init];
		for (NSPasteboardType type in source.types) {
			NSData* data = [source dataForType:type];
			if (data) [copy setData:data forType:type];
		}
		[copies addObject:copy];
	}
	NSString* token = NSUUID.UUID.UUIDString;
	ClipboardSnapshots()[token] = [copies copy];
	return Napi::String::New(env, token.UTF8String);
}

Napi::Value RestoreClipboard(const Napi::CallbackInfo& info) {
	Napi::Env env = info.Env();
	if (info.Length() < 1 || !info[0].IsString()) {
		return Throw(env, "clipboard snapshot token is required");
	}
	NSString* token = [NSString
		stringWithUTF8String:info[0].As<Napi::String>().Utf8Value().c_str()];
	NSArray<NSPasteboardItem*>* items = ClipboardSnapshots()[token];
	if (!items) return Napi::Boolean::New(env, false);
	NSPasteboard* pasteboard = NSPasteboard.generalPasteboard;
	[pasteboard clearContents];
	BOOL ok = [pasteboard writeObjects:items];
	[ClipboardSnapshots() removeObjectForKey:token];
	return Napi::Boolean::New(env, ok == YES);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
	exports.Set("isAvailable", Napi::Function::New(env, IsAvailable));
	exports.Set("listSpaces", Napi::Function::New(env, ListSpaces));
	exports.Set("spacesForWindow", Napi::Function::New(env, SpacesForWindow));
	exports.Set("switchSpace", Napi::Function::New(env, SwitchSpace));
	exports.Set(
		"moveWindowToSpace",
		Napi::Function::New(env, MoveWindowToSpace));
	exports.Set("windowAction", Napi::Function::New(env, WindowAction));
	exports.Set("appAction", Napi::Function::New(env, AppAction));
	exports.Set("listDockItems", Napi::Function::New(env, ListDockItems));
	exports.Set("dockAction", Napi::Function::New(env, DockAction));
	exports.Set("isDockHidden", Napi::Function::New(env, IsDockHidden));
	exports.Set("setDockHidden", Napi::Function::New(env, SetDockHidden));
	exports.Set("saveClipboard", Napi::Function::New(env, SaveClipboard));
	exports.Set("restoreClipboard", Napi::Function::New(env, RestoreClipboard));
	return exports;
}

}  // namespace

NODE_API_MODULE(macos_computer_provider, Init)

#else

Napi::Value IsAvailable(const Napi::CallbackInfo& info) {
	return Napi::Boolean::New(info.Env(), false);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
	exports.Set("isAvailable", Napi::Function::New(env, IsAvailable));
	return exports;
}

NODE_API_MODULE(macos_computer_provider, Init)

#endif
