/* ChronoRail Terms of Use + Privacy Notice. DRAFT 2026-11-18, written by Claude for SCJG review; not legal advice.
   Plain language, matched to what the code actually stores (src/worker.js, migrations/0001_auth.sql, assets/app.js).
   Each section: [heading, [paragraph | [bullet, ...]]]. Rendered by legal() in app.js. */
window.LEGAL = {
  meta: { updated: "DRAFT · 2026-11-18", owner: "SCJG LLC", place: "Pagosa Springs, Colorado", contact: "io@scjg.cc" },
  terms: {
    title: "Terms of Use",
    intro: "These terms cover chronorail.si (ChronoRail), a free directory of music-production tools run by SCJG LLC as part of ChronoWare. By using the site, or by creating an account, you agree to them.",
    sections: [
      ["The service", ["ChronoRail is free to use. You can browse, search and save tools without an account. An account (a ChronoWare ID) only adds syncing your rack across devices.",
        "We may change, pause or stop any part of the service. If we shut down accounts, we will give notice on the site first and let you export your rack."]],
      ["Listings are information, not advice", ["Listings describe third-party products. We check them against official sources, but prices, formats, platforms and licences change, and some listings are marked UNVERIFIED. Always confirm on the maker's official site before you buy or install anything.",
        "We are not affiliated with the makers listed unless a listing says SCJG-owned. Featured, paid and affiliate placements are always labelled and never change the default order."]],
      ["Your account", [["Use an email address you control. Sign-in links are single-use and expire after 10 minutes.", "One account per person. Don't share sign-in links.", "You can delete your account at any time from the Account page."]]],
      ["Your rack and notes", ["Your rack, statuses and notes are yours. Notes are private: we don't publish them. A share link shows only the list of tools, and anyone with the link can see that list."]],
      ["Fair use", [["Don't attack, overload or try to break into the service or other people's accounts.", "Don't use the site to send spam or to collect other people's information.", "The public JSON feed and llms.txt are there to be read by people and machines; please cache them and keep requests reasonable."],
        "We may suspend accounts that break these rules."]],
      ["No warranty", ["The service is provided as is. To the extent the law allows, SCJG LLC is not liable for losses that come from using the site or relying on a listing, and our total liability for any claim is limited to what you paid us for the service in the last 12 months (for a free service, nothing)."]],
      ["Changes and law", ["We may update these terms. We will change the date at the top and, for material changes, show a notice to signed-in users. These terms are governed by the laws of Colorado, USA.",
        "Questions: io@scjg.cc."]]
    ]
  },
  privacy: {
    title: "Privacy Notice",
    intro: "What ChronoRail stores about you, why, and how to get it removed. Short version: no ads, no tracking, no selling data.",
    sections: [
      ["Without an account", [["Your rack, notes and display settings are kept in your browser (localStorage). They never leave your device unless you sign in or export them.", "Our host, Cloudflare, processes each request to deliver the site and protect it from abuse.", "The site loads fonts from Google Fonts, so Google receives your IP address when the page loads."]]],
      ["With an account", [["Your email address, and your name and profile picture if you sign in with Google.", "Session records: when you signed in, your IP address and browser type. Sessions last 30 days.", "Your synced rack: the tools you saved, their Own / Want / Tried status, and your notes.", "Short-lived records used to stop abuse, such as a count of sign-in requests per IP address."]]],
      ["What we use it for", ["Only to sign you in, sync your rack, send sign-in links you ask for, and keep the service secure. We don't send marketing email, run ads, use analytics trackers, or sell or rent your information."]],
      ["Who processes it", [["Cloudflare: hosting, database and sign-in email delivery.", "Google: only if you choose Continue with Google, and for web fonts."]]],
      ["How long we keep it", ["Account data stays until you delete your account. Sign-in links expire after 10 minutes. Sessions expire after 30 days. Abuse-prevention records are kept only as long as needed."]],
      ["Your choices", [["Delete your account from the Account page. This removes your account, sessions and synced rack straight away. The copy in your browser stays until you clear it.", "Export your rack as JSON from My Rack at any time.", "To ask what we hold about you, or for anything else, email io@scjg.cc."]]],
      ["Children", ["ChronoRail isn't directed at children under 13, and we don't knowingly create accounts for them."]],
      ["Changes", ["If this notice changes, we'll update the date at the top and tell signed-in users about material changes. Contact: SCJG LLC, Pagosa Springs, Colorado · io@scjg.cc."]]
    ]
  }
};
