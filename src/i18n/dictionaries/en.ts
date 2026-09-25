/**
 * English copy (source of truth for all other locales).
 *
 * Keep keys grouped by screen. Other dictionaries are typed against `Dictionary`,
 * so a missing translation is a compile error rather than a blank string in production.
 */
const en = {
  meta: {
    title: "Orbtrade — Buy, sell and hold crypto with confidence",
    description:
      "Orbtrade is a crypto brokerage for buying, selling, swapping and holding digital assets, with verified accounts, transparent fees and bank-grade security controls.",
  },
  common: {
    createAccount: "Create account",
    logIn: "Log in",
    getStarted: "Get started",
    learnMore: "Learn more",
    viewAll: "View all",
    comingSoon: "Coming soon",
    loading: "Loading",
    close: "Close",
    menu: "Menu",
    theme: { toggle: "Toggle theme", dark: "Dark", light: "Light" },
    language: "Language",
    backHome: "Back to home",
  },
  nav: {
    markets: "Markets",
    features: "Features",
    security: "Security",
    fees: "Fees",
    faq: "FAQ",
    learn: "Learn",
  },
  promo: {
    endsIn: "Ends in",
    dismiss: "Dismiss promotion",
    days: "d",
    hours: "h",
    minutes: "m",
    seconds: "s",
  },
  hero: {
    eyebrow: "Crypto brokerage, built for clarity",
    titleA: "Trade crypto",
    titleB: "in orbit.",
    subtitle:
      "Buy, sell, swap and hold leading digital assets from one secure account. Live prices, transparent fees, and verification that protects you, not just us.",
    secondaryCta: "Explore markets",
    points: ["Verified accounts", "2FA & passkeys", "Fees shown before you confirm"],
    livePrices: "Live prices",
  },
  markets: {
    title: "Markets, live",
    subtitle: "Prices stream in real time from public market data. Charts show the last 7 days.",
    asset: "Asset",
    price: "Price",
    change24h: "24h",
    chart7d: "7d chart",
    unavailable: "Live prices are temporarily unavailable. Please try again shortly.",
    live: "Live",
    delayed: "Delayed",
  },
  features: {
    title: "Everything you need, nothing you don't",
    subtitle: "One account for your whole crypto journey, from your first purchase to advanced order types.",
    items: [
      { title: "Buy, sell & swap", body: "Instant trades at live rates with the full fee shown before you confirm." },
      { title: "Order book trading", body: "Market and limit orders for when you want precise control over price." },
      {
        title: "Multiple accounts",
        body: "Separate Trading and Savings accounts, with instant transfers between them.",
      },
      { title: "Recurring buys", body: "Automate daily, weekly or monthly purchases and build positions steadily." },
      { title: "Price alerts", body: "Get notified by email or push the moment a coin reaches your target." },
      { title: "Demo mode", body: "Practise with virtual funds, clearly labelled DEMO, before risking real money." },
    ],
  },
  how: {
    title: "Up and running in minutes",
    steps: [
      { title: "Create your account", body: "Sign up with your email and set a strong password." },
      { title: "Verify your identity", body: "Confirm your email and phone, then upload your ID and a selfie." },
      { title: "Fund your account", body: "Deposit by bank transfer, card, mobile money or crypto." },
      { title: "Start trading", body: "Buy, sell, swap or set up recurring buys, all with live rates." },
    ],
  },
  security: {
    title: "Security that's built in, not bolted on",
    subtitle: "Your account is protected by layered controls at every step, from sign-in to withdrawal.",
    items: [
      { title: "Two-factor & passkeys", body: "Protect sign-in with an authenticator app or device biometrics." },
      {
        title: "Withdrawal safeguards",
        body: "Withdrawals require 2FA or email confirmation, and new addresses must be approved.",
      },
      { title: "Encrypted data", body: "Sensitive data is encrypted at rest and all traffic is served over HTTPS." },
      { title: "Identity verification", body: "KYC checks help keep fraud and money laundering off the platform." },
      { title: "Security log", body: "See every recent sign-in with device, IP address, location and time." },
      {
        title: "Audited ledger",
        body: "Balances only change through recorded transactions. Nothing is edited silently.",
      },
    ],
  },
  fees: {
    title: "Transparent fees",
    subtitle: "Always shown before you confirm. Higher loyalty tiers unlock lower trading fees.",
    type: "Type",
    fee: "Fee",
    note: "Network fees for crypto withdrawals are passed through at cost and shown before you confirm. Fees may change; the fee shown at confirmation is the one you pay.",
  },
  testimonials: {
    title: "What our customers say",
    subtitle: "Reviews from verified Orbtrade customers.",
    emptyTitle: "No reviews yet",
    emptyBody:
      "We only publish genuine reviews from verified customers. Once real reviews are submitted and approved, they'll appear here.",
    verified: "Verified customer",
  },
  faq: {
    title: "Frequently asked questions",
    items: [
      {
        q: "Why do I need to verify my identity?",
        a: "Identity verification (KYC) is required by anti-money-laundering rules and protects your account. You can explore the dashboard straight away, but deposits and withdrawals unlock once your verification is approved.",
      },
      {
        q: "How long does verification take?",
        a: "Most reviews are completed quickly once your documents are clear and legible. You'll be notified by email as soon as your status changes.",
      },
      {
        q: "What fees will I pay?",
        a: "Our fee schedule is published on this page, and every trade, deposit and withdrawal shows the exact fee before you confirm. There are no hidden charges.",
      },
      {
        q: "Which payment methods can I use?",
        a: "Bank transfer, debit or credit card, mobile money and crypto deposits. Availability can vary by country.",
      },
      {
        q: "Can I try Orbtrade without real money?",
        a: "Yes. Demo mode gives you virtual funds to practise with. Everything in demo mode is clearly labelled DEMO and never touches your real balance.",
      },
      {
        q: "Is crypto risky?",
        a: "Yes. Crypto prices are highly volatile and you could lose some or all of the money you invest. Only invest what you can afford to lose, and read our Risk Disclosure.",
      },
    ],
  },
  blog: {
    title: "From the blog",
    subtitle: "Guides, market explainers and product news.",
    emptyBody: "Our first articles are on the way. Check back soon.",
    readMore: "Read article",
  },
  cta: {
    title: "Ready to start your crypto journey?",
    subtitle: "Open an account in minutes. Explore the dashboard while your verification is reviewed.",
  },
  footer: {
    tagline: "A modern crypto brokerage for buying, selling and holding digital assets.",
    product: "Product",
    company: "Company",
    legal: "Legal",
    support: "Support",
    links: {
      markets: "Markets",
      fees: "Fees",
      security: "Security",
      learn: "Learn",
      blog: "Blog",
      about: "About",
      careers: "Careers",
      help: "Help centre",
      contact: "Contact",
      listing: "Request a listing",
      terms: "Terms of Service",
      privacy: "Privacy Policy",
      risk: "Risk Disclosure",
      aml: "AML & KYC Policy",
    },
    riskWarning:
      "Risk warning: Cryptoassets are highly volatile and unregulated in some jurisdictions. The value of your investment can go down as well as up, and you may lose all the money you invest. Past performance is not a reliable indicator of future results. Nothing on this site is financial advice.",
    rights: "All rights reserved.",
  },
  legal: {
    placeholderTitle: "Draft placeholder",
    placeholderBody:
      "This page is a placeholder. The final text must be written and reviewed by qualified legal counsel for each jurisdiction Orbtrade operates in before launch.",
    lastUpdated: "Last updated",
    pages: {
      terms: "Terms of Service",
      privacy: "Privacy Policy",
      risk: "Risk Disclosure",
      aml: "AML & KYC Policy",
    },
  },
  placeholder: {
    title: "This area is under construction",
    body: "This part of Orbtrade is being built in an upcoming phase.",
  },
};

export default en;
export type Dictionary = typeof en;
