import {
	createContext,
	type PropsWithChildren,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	DEFAULT_LOCALE,
	LOCALE_STORAGE_KEY,
	type Locale,
	type MessageKey,
	messages,
	SUPPORTED_LOCALES,
} from "./messages";

type MessageValues = Record<string, number | string>;

interface I18nContextValue {
	locale: Locale;
	setLocale: (locale: Locale) => void;
	t: (key: MessageKey, values?: MessageValues) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function isSupportedLocale(value: string | null): value is Locale {
	return SUPPORTED_LOCALES.includes(value as Locale);
}

function resolveInitialLocale(): Locale {
	try {
		const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
		if (isSupportedLocale(storedLocale)) {
			return storedLocale;
		}
	} catch {
		// Local storage may be unavailable in a restricted renderer context.
	}

	return navigator.languages.some((locale) => locale.startsWith("zh"))
		? "zh-CN"
		: DEFAULT_LOCALE;
}

function formatMessage(template: string, values?: MessageValues): string {
	if (!values) return template;

	return template.replace(/\{(\w+)\}/g, (placeholder, key: string) => {
		const value = values[key];
		return value === undefined ? placeholder : String(value);
	});
}

export function I18nProvider({ children }: PropsWithChildren) {
	const [locale, updateLocale] = useState<Locale>(resolveInitialLocale);

	useEffect(() => {
		document.documentElement.lang = locale;
	}, [locale]);

	const setLocale = useCallback((nextLocale: Locale) => {
		updateLocale(nextLocale);
		document.documentElement.lang = nextLocale;
		try {
			window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
		} catch {
			// The selected locale remains active for the current session.
		}
	}, []);

	const t = useCallback(
		(key: MessageKey, values?: MessageValues) =>
			formatMessage(
				messages[locale][key] ?? messages[DEFAULT_LOCALE][key],
				values,
			),
		[locale],
	);

	const value = useMemo(
		() => ({ locale, setLocale, t }),
		[locale, setLocale, t],
	);

	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nContextValue {
	const context = useContext(I18nContext);
	if (!context) {
		throw new Error("useTranslation must be used within an I18nProvider");
	}
	return context;
}
