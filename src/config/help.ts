/**
 * Help-centre articles (short answers). Admin-managed FAQ items (Admin →
 * Content) are shown on /faq in addition to these. Keep answers factual: no
 * promises about returns, and point to the risk warning where relevant.
 */
export const helpTopics: { id: string; title: string; items: { q: string; a: string }[] }[] = [
  {
    id: "account",
    title: "Account & security",
    items: [
      { q: "How do I turn on two-factor authentication?", a: "Go to More → Security and choose Set up 2FA. Scan the QR code with an authenticator app, enter the 6-digit code, and store your recovery codes somewhere safe." },
      { q: "I lost my authenticator device.", a: "Log in with one of your recovery codes, then set up 2FA again on your new device. If you have no recovery codes, contact support; we'll verify your identity before resetting 2FA." },
      { q: "How do I change my password?", a: "More → Security → Change password. You'll need your current password. Other devices are signed out when you change it." },
      { q: "Will Trade In Orbit ever ask for my password or 2FA codes?", a: "Never. Staff will never ask for your password, 2FA codes, recovery codes or card details by chat, email or phone." },
    ],
  },
  {
    id: "verification",
    title: "Verification (KYC)",
    items: [
      { q: "Why do I need to verify my identity?", a: "Financial regulations require us to verify customers before they deposit, trade real funds or withdraw. It also protects your account from fraud." },
      { q: "How long does verification take?", a: "Most reviews are completed within one business day. You'll get a notification when it's done." },
      { q: "My verification was rejected.", a: "The notification explains why. Fix the issue (for example a blurry photo or an expired document) and submit again from the verification page." },
    ],
  },
  {
    id: "funding",
    title: "Deposits & withdrawals",
    items: [
      { q: "How can I deposit?", a: "In crypto only, from the Deposit page: pick a coin (and for USDT, the network), send it to the address or QR code shown, then tell us the amount. It shows as Pending until our team confirms it arrived, then it is added to your balance and we email you." },
      { q: "How long do withdrawals take?", a: "Withdrawals go to a crypto wallet address and are approved by our team first. They usually arrive within an hour of approval, and we email you when it is approved or rejected." },
      { q: "Why is my withdrawal Pending?", a: "Every withdrawal is approved by our team before it's sent. While it shows as Pending, the amount is deducted from your balance; if it's rejected it shows as Failed and the funds go back to your account. The Withdraw and History pages show the current status." },
    ],
  },
  {
    id: "trading",
    title: "Trading",
    items: [
      { q: "What are the trading fees?", a: "Fees are shown on the Trade page and in the fee table on our home page. Higher loyalty tiers get discounts (see Rewards)." },
      { q: "What's the difference between a market and a limit order?", a: "A market order fills immediately at the current price. A limit order fills only when the market reaches your price; the funds are reserved until then." },
      { q: "What is demo mode?", a: "Demo mode lets you practise with virtual funds at live prices. Demo balances aren't real money and can't be withdrawn." },
      { q: "Can I lose money?", a: "Yes. Crypto prices are volatile and you can lose some or all of the money you invest. Read our risk warning before trading." },
    ],
  },
];
