(function () {
  const script = document.currentScript;
  const storageKey =
    script && script.dataset.storageKey
      ? script.dataset.storageKey
      : "aioc-docs-analytics-consent";
  const googleTagId =
    script && script.dataset.googleTagId ? script.dataset.googleTagId : "";

  const readConsent = () => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  };

  const writeConsent = (value) => {
    try {
      localStorage.setItem(storageKey, value);
    } catch {
      // Consent still updates for the current page even if storage is unavailable.
    }
  };

  const updateConsent = (value) => {
    if (typeof window.gtag !== "function") return;

    window.gtag("consent", "update", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: value === "granted" ? "granted" : "denied",
    });

    if (value === "granted" && googleTagId) {
      window.gtag("config", googleTagId);
    }
  };

  const createBanner = () => {
    const banner = document.createElement("aside");
    banner.className = "aioc-consent";
    banner.setAttribute("aria-label", "Analytics consent");

    const text = document.createElement("p");
    text.className = "aioc-consent__text";
    text.textContent =
      "We use Google Analytics to understand how the documentation is used. You can allow or decline analytics cookies.";

    const actions = document.createElement("div");
    actions.className = "aioc-consent__actions";

    const accept = document.createElement("button");
    accept.className = "aioc-consent__button aioc-consent__button--primary";
    accept.type = "button";
    accept.textContent = "Accept analytics";

    const decline = document.createElement("button");
    decline.className = "aioc-consent__button";
    decline.type = "button";
    decline.textContent = "Decline";

    accept.addEventListener("click", () => {
      writeConsent("granted");
      updateConsent("granted");
      banner.hidden = true;
    });

    decline.addEventListener("click", () => {
      writeConsent("denied");
      updateConsent("denied");
      banner.hidden = true;
    });

    actions.append(accept, decline);
    banner.append(text, actions);
    return banner;
  };

  const init = () => {
    const consent = readConsent();
    if (consent === "granted" || consent === "denied") {
      updateConsent(consent);
      return;
    }

    document.body.append(createBanner());
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
