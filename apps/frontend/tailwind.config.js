var config = {
    darkMode: ["class", '[data-theme="dark"]'],
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                background: "rgb(var(--color-background) / <alpha-value>)",
                surface: "rgb(var(--color-surface) / <alpha-value>)",
                surfaceMuted: "rgb(var(--color-surface-muted) / <alpha-value>)",
                text: "rgb(var(--color-text) / <alpha-value>)",
                muted: "rgb(var(--color-text-muted) / <alpha-value>)",
                primary: "rgb(var(--color-primary) / <alpha-value>)",
                secondary: "rgb(var(--color-secondary) / <alpha-value>)",
                accent: "rgb(var(--color-accent) / <alpha-value>)",
            },
            fontFamily: {
                heading: ['"Sansation"', "sans-serif"],
                body: ['"Inter"', "system-ui", "-apple-system", "BlinkMacSystemFont", "\"Segoe UI\"", "sans-serif"],
            },
            boxShadow: {
                focus: "0 0 0 3px rgba(71, 185, 255, 0.45)",
            },
            animation: {
                "orbit-spin": "spin 4s linear infinite",
            },
        },
    },
    plugins: [],
};
export default config;
