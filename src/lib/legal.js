import { queryOne, execute } from "./db";
import { HttpError } from "./http-error";

/**
 * The privacy policy and terms of use at /privacy and /terms (public; the App Store and the sign-up screens link to
 * them), in English and Chinese. Who runs the portal and how to reach them is set by an administrator on the Mobile
 * app page; until then the texts point at "the administrator of this portal". Change LEGAL_UPDATED with the text.
 */
export const LEGAL_UPDATED = "2026-10-24";

export async function readLegal() {
  const row = await queryOne("SELECT value FROM app_settings WHERE name = 'legal'").catch(() => null);
  let v = {};
  try { v = row?.value ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) : {}; } catch {}
  const str = (s, n) => (typeof s === "string" && s.trim() ? s.trim().slice(0, n) : null);
  return { operator: str(v.operator, 160), contact_email: str(v.contact_email, 190), country: str(v.country, 80) };
}

export async function saveLegal(body, userId) {
  const cur = await readLegal();
  const pick = (k, n) => (k in body ? String(body[k] ?? "").trim().slice(0, n) || null : cur[k]);
  const next = { operator: pick("operator", 160), contact_email: pick("contact_email", 190), country: pick("country", 80) };
  if (next.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.contact_email)) throw new HttpError("The contact address does not look like an email address.", 400);
  await execute("INSERT INTO app_settings (name, value, updated_by) VALUES ('legal', ?, ?) AS new ON DUPLICATE KEY UPDATE value = new.value, updated_by = new.updated_by", [JSON.stringify(next), userId]);
  return next;
}

/**
 * One document as { title, intro, sections: [{ id, title, body: [string | { list: string[] }] }] }.
 * `kind` is "privacy" or "terms", `locale` "en" or "zh-CN".
 */
export function legalDoc(kind, locale, { operator, contact_email: contact, country }, origin) {
  if (locale !== "zh-CN") {
    const who = operator || "the administrator of this portal";
    const reach = contact ? `write to ${contact}` : "contact the administrator of this portal";
    return enDocs(who, reach, country || "the place where the operator is established", origin)[kind];
  }
  // Latin names inside Chinese text get a space on each side; tidyZh takes it away again next to full-width punctuation
  const pad = (v) => v.replace(/^(?=[A-Za-z0-9])/, " ").replace(/(?<=[A-Za-z0-9.)])$/, " ");
  const who = operator ? pad(operator) : "本门户的管理员";
  const reach = contact ? `发送电子邮件至 ${contact}` : "联系本门户的管理员";
  return tidyZh(zhDocs(who, reach, country ? pad(country) : "运营方所在地", origin)[kind]);
}

function tidyZh(v) {
  if (typeof v === "string") return v.replace(/\s*([，。：；、“”（）])\s*/g, "$1").replace(/ {2,}/g, " ").trim();
  if (Array.isArray(v)) return v.map(tidyZh);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "id" ? x : tidyZh(x)]));
}

function enDocs(who, reach, law, origin) {
  return {
    privacy: {
      title: "Privacy Policy",
      intro: `This policy explains what ${who} collects when you use Task Portal at ${origin} and in the Task Portal apps for iPhone and Android, why it is needed, and what you can do about it.`,
      sections: [
        { id: "who", title: "Who is responsible", body: [`Task Portal is run by ${who}. For anything about your data, ${reach}.`] },
        {
          id: "collect", title: "What we collect", body: [
            { list: [
              "Your account: your name, your email address and a protected form (hash) of your password, never the password itself; your profile picture if you add one; your settings.",
              "What you put in: workspaces, projects, people records, tasks with their comments, checklists, outputs and files, requirements, notes, draw boards, calendar events, time entries, Info vault items (their secrets are stored encrypted), and your chat messages with the photos, files, voice notes, stickers and locations you choose to send.",
              "Sign-ins and security: when you sign in and from where (IP address, browser or app, operating system and type of device), your active sessions, and whether you use two-factor authentication or passkeys.",
              "Notifications: if you allow them, a push token for your browser or phone so notifications can reach it.",
              "Calls: voice and video calls go directly between the devices, encrypted. When a direct connection is not possible they pass, still encrypted, through a relay. Calls are not recorded.",
              "If you sign in with Google: your name, email address and Google account number, nothing else from your Google account.",
              "Cookies: the website sets only the cookies it needs to sign you in, keep you signed in, remember a device you trust for two-factor sign-in and remember your language. Display settings stay in your browser.",
            ] },
            "We do not use advertising, analytics or tracking tools, and we do not sell or rent your data.",
          ],
        },
        {
          id: "use", title: "Why we use it", body: [
            "To provide the service you signed up for: to sign you in and keep your account safe, to store your work and show it to you and to the people you share it with, to deliver your messages, calls and notifications, to send the emails you ask for or allow (codes, password resets, invitations, notification emails), and to keep the service running and backed up.",
            "Where data protection law asks for a legal basis, it is the agreement between you and us (providing the service) and our legitimate interest in keeping the service and its users secure.",
          ],
        },
        {
          id: "share", title: "Who can see it", body: [
            { list: [
              "The people you share a workspace with, according to the role you give them, and the people you chat with.",
              "The administrators of this portal, who manage accounts, review reported messages and can reach the stored data when that is needed to run and protect the service.",
              "Companies that help run the service, only for that purpose: the server hosting, the email service that delivers our emails, the push services of Apple, Google and the browser makers that deliver notifications to your devices, and a relay for calls that cannot connect directly.",
              "GIF search, when it is switched on: our server sends what you search for to the GIF provider (GIPHY or Tenor), and the previews are loaded from the provider. A GIF you send is copied to our server.",
              "Other systems you connect yourself (through the API, webhooks or integrations such as Bitara PMS): they receive what you choose to send them.",
            ] },
            "We disclose data to authorities only where the law requires it.",
          ],
        },
        {
          id: "keep", title: "How long we keep it", body: [
            "As long as your account exists. Things you delete stay in the recycle bin for 30 days and are then removed. The sign-in history is kept for 180 days and the record of sent emails for 60 days. An administrator may also set a time limit for chat history. Backups are kept for up to about six months and then overwritten.",
            "When you delete your account, everything that is only yours is deleted at once, files included; it disappears from the backups as they rotate. What you added to workspaces that belong to other people stays there, as part of their workspace.",
          ],
        },
        {
          id: "rights", title: "Your choices and rights", body: [
            { list: [
              "See and change your details and your content in the app at any time; export a chat from the chat menu.",
              "Turn notifications, notification emails or individual kinds of notifications off.",
              "Delete your account at any time: on the Security page on the web, or in the iPhone app under More → Delete account.",
              `For access to or correction of your data, an objection, or any other request, ${reach}. You may also complain to the data protection authority where you live.`,
            ] },
          ],
        },
        { id: "security", title: "Security", body: ["Passwords are stored only as hashes, Info vault secrets are encrypted, connections use HTTPS, and you can add two-factor authentication or a passkey and see where your account is signed in. No system is perfectly secure; if something happens that puts your data at risk, we will tell you as the law requires."] },
        { id: "children", title: "Children", body: ["Task Portal is not meant for children under 13, or under the minimum age for consent where you live (16 in some countries). We do not knowingly collect their data; if you believe a child has given us data, tell us and we will delete it."] },
        { id: "changes", title: "Changes", body: ["When this policy changes, the new version appears here with a new date. Significant changes are announced in the app or by email before they apply."] },
        { id: "contact", title: "Contact", body: [`${who.charAt(0).toUpperCase()}${who.slice(1)}: ${reach}.`] },
      ],
    },
    terms: {
      title: "Terms of Use",
      intro: `These terms apply to Task Portal at ${origin} and to the Task Portal apps, run by ${who}. By creating an account or using Task Portal you agree to them. If you use it for an organisation, you confirm that you may agree for it.`,
      sections: [
        { id: "account", title: "Your account", body: ["Give your true name and an email address you control, keep your password safe, and tell us if you think someone else is using your account. You are responsible for what happens under your account."] },
        { id: "content", title: "Your content", body: ["What you put into Task Portal stays yours. You allow us to store, process and show it as needed to run the service for you and for the people you share it with. You are responsible for your content and for having the right to share it."] },
        {
          id: "use", title: "Acceptable use", body: [
            "Do not use Task Portal to:",
            { list: [
              "break the law, or store or share content that is illegal, hateful, threatening or that infringes other people's rights;",
              "harass, spam or impersonate anyone, or collect other people's data without their permission;",
              "spread malware, try to get into accounts or systems that are not yours, or overload or disrupt the service.",
            ] },
            "People can block others and report messages. Administrators may remove content and suspend or close accounts that break these terms.",
          ],
        },
        { id: "workspaces", title: "Shared workspaces", body: ["A workspace belongs to its owner, who decides who is in it and what they may do. What members add becomes part of that workspace. When an owner deletes their account, their workspaces are deleted with it, unless they hand them over first."] },
        { id: "service", title: "The service", body: ["We work to keep Task Portal available and your data safe, but we cannot promise that it will always be available or free of errors. Features may change. Keep your own copies of anything you cannot afford to lose. We may end the service with reasonable notice."] },
        { id: "ending", title: "Ending", body: ["You can delete your account at any time (Security page on the web, More → Delete account in the iPhone app). We may suspend or close an account that breaks these terms, and tell you why when we can."] },
        { id: "liability", title: "Warranties and liability", body: ["Task Portal is provided as it is, without warranties beyond those the law requires. To the extent the law allows, we are not liable for indirect or consequential losses, or for loss of data or profits. Nothing in these terms limits liability that cannot be limited by law, or your rights as a consumer."] },
        { id: "apple", title: "The iPhone app", body: ["These terms are between you and us, not Apple. Apple is not responsible for the app or its content, has no obligation to provide maintenance or support for it, and is not responsible for any claims about it. Apple and its subsidiaries are third-party beneficiaries of these terms and may enforce them against you."] },
        { id: "law", title: "Applicable law", body: [`These terms are governed by the laws of ${law}, unless the law of the country you live in gives you the right to rely on its laws.`] },
        { id: "changes", title: "Changes", body: ["When these terms change, the new version appears here with a new date. Significant changes are announced in the app or by email before they apply; if you keep using Task Portal afterwards, you accept them."] },
        { id: "contact", title: "Contact", body: [`Questions about these terms: ${reach}.`] },
      ],
    },
  };
}

function zhDocs(who, reach, law, origin) {
  return {
    privacy: {
      title: "隐私政策",
      intro: `本政策说明当你使用位于 ${origin} 的 Task Portal 以及 Task Portal iPhone 和 Android 应用时，${who}会收集哪些信息、为什么需要这些信息，以及你可以如何处理。`,
      sections: [
        { id: "who", title: "负责方", body: [`Task Portal 由${who}运营。关于你的数据的任何问题，请${reach}。`] },
        {
          id: "collect", title: "我们收集的信息", body: [
            { list: [
              "你的账户：姓名、电子邮件地址以及密码的受保护形式（哈希值），绝不保存密码本身；你添加的头像；你的设置。",
              "你放入的内容：工作区、项目、人员记录、任务及其评论、清单、产出和文件、需求、笔记、画板、日历事件、工时记录、资料项目（其中的机密内容加密存储），以及你的聊天消息和你选择发送的照片、文件、语音、贴纸和位置。",
              "登录与安全：你何时以及从何处登录（IP 地址、浏览器或应用、操作系统和设备类型）、你的有效会话，以及你是否使用两步验证或通行密钥。",
              "通知：如果你允许通知，我们会保存你的浏览器或手机的推送令牌，以便通知能够送达。",
              "通话：语音和视频通话在设备之间直接进行并加密。无法直接连接时，通话会以加密方式经由中继转发。通话不会被录制。",
              "如果你使用 Google 登录：你的姓名、电子邮件地址和 Google 账户编号，不会获取你 Google 账户中的其他信息。",
              "Cookie：网站只设置必需的 Cookie，用于让你登录、保持登录状态、记住你在两步验证中信任的设备，以及记住你的语言。显示设置保存在你的浏览器中。",
            ] },
            "我们不使用广告、分析或跟踪工具，也不出售或出租你的数据。",
          ],
        },
        {
          id: "use", title: "我们为何使用这些信息", body: [
            "为了提供你注册使用的服务：让你登录并保护你的账户安全；存储你的工作内容，并展示给你以及你与之共享的人；传送你的消息、通话和通知；发送你要求或允许的电子邮件（验证码、重置密码、邀请、通知邮件）；以及保持服务运行并进行备份。",
            "在数据保护法律要求说明法律依据的情况下，依据是你与我们之间的协议（提供服务），以及我们保障服务及其用户安全的正当利益。",
          ],
        },
        {
          id: "share", title: "谁能看到这些信息", body: [
            { list: [
              "你与之共享工作区的人（按照你给予的角色），以及与你聊天的人。",
              "本门户的管理员，他们管理账户、审核被举报的消息，并在运行和保护服务需要时访问存储的数据。",
              "仅为此目的协助运行服务的公司：服务器托管方、发送我们邮件的电子邮件服务、将通知送达你设备的 Apple、Google 及各浏览器厂商的推送服务，以及在无法直接连接时用于通话的中继。",
              "GIF 搜索（开启时）：我们的服务器会把你搜索的内容发送给 GIF 提供方（GIPHY 或 Tenor），预览图从提供方加载。你发送的 GIF 会被复制到我们的服务器。",
              "你自己连接的其他系统（通过 API、Webhook 或 Bitara PMS 等集成）：它们会收到你选择发送的内容。",
            ] },
            "只有在法律要求时，我们才会向有关机关披露数据。",
          ],
        },
        {
          id: "keep", title: "我们保留多久", body: [
            "在你的账户存在期间一直保留。你删除的内容会在回收站中保留 30 天，然后被移除。登录记录保留 180 天，已发送邮件的记录保留 60 天。管理员也可以为聊天记录设置保留期限。备份最多保留约六个月，之后会被覆盖。",
            "当你删除账户时，只属于你的一切（包括文件）都会立即删除；随着备份轮换，这些内容也会从备份中消失。你添加到属于他人的工作区中的内容会留在那里，作为其工作区的一部分。",
          ],
        },
        {
          id: "rights", title: "你的选择和权利", body: [
            { list: [
              "随时在应用中查看和修改你的资料和内容；在聊天菜单中导出聊天记录。",
              "关闭通知、通知邮件或某些类型的通知。",
              "随时删除你的账户：在网页的“安全”页面，或在 iPhone 应用的“更多 → 删除账户”中。",
              `如需访问或更正你的数据、提出异议或任何其他请求，请${reach}。你也可以向你所在地的数据保护机构投诉。`,
            ] },
          ],
        },
        { id: "security", title: "安全", body: ["密码只以哈希值存储，资料中的机密内容经过加密，连接使用 HTTPS，你可以启用两步验证或通行密钥，并查看你的账户在哪里登录。任何系统都不可能绝对安全；如果发生危及你数据的事件，我们会按照法律要求通知你。"] },
        { id: "children", title: "儿童", body: ["Task Portal 不面向 13 岁以下的儿童，或低于你所在地同意年龄（部分国家为 16 岁）的人。我们不会在知情的情况下收集他们的数据；如果你认为有儿童向我们提供了数据，请告知我们，我们会将其删除。"] },
        { id: "changes", title: "变更", body: ["本政策变更时，新版本会连同新日期发布在此页面。重大变更会在生效前通过应用或电子邮件通知。"] },
        { id: "contact", title: "联系方式", body: [`${who}：请${reach}。`] },
      ],
    },
    terms: {
      title: "使用条款",
      intro: `本条款适用于位于 ${origin} 的 Task Portal 以及由${who}运营的 Task Portal 应用。创建账户或使用 Task Portal 即表示你同意本条款。如果你代表某个组织使用，你确认你有权代表该组织同意。`,
      sections: [
        { id: "account", title: "你的账户", body: ["请提供你的真实姓名和你能控制的电子邮件地址，妥善保管你的密码；如果你认为有人在使用你的账户，请告诉我们。你对你账户下发生的一切负责。"] },
        { id: "content", title: "你的内容", body: ["你放入 Task Portal 的内容仍归你所有。你允许我们为你以及你与之共享的人提供服务所需而存储、处理和展示这些内容。你对你的内容负责，并须拥有分享它的权利。"] },
        {
          id: "use", title: "可接受的使用", body: [
            "请勿使用 Task Portal 来：",
            { list: [
              "违反法律，或存储、分享违法、仇恨、威胁性或侵犯他人权利的内容；",
              "骚扰他人、发送垃圾信息或冒充他人，或未经许可收集他人数据；",
              "传播恶意软件、试图进入不属于你的账户或系统，或使服务过载、中断。",
            ] },
            "用户可以屏蔽他人并举报消息。管理员可以移除内容，并暂停或关闭违反本条款的账户。",
          ],
        },
        { id: "workspaces", title: "共享工作区", body: ["工作区属于其所有者，由所有者决定谁可以加入以及能做什么。成员添加的内容成为该工作区的一部分。所有者删除账户时，其工作区会一并删除，除非所有者事先将其移交给他人。"] },
        { id: "service", title: "服务", body: ["我们努力保持 Task Portal 可用并保护你的数据安全，但无法保证服务始终可用或没有错误。功能可能会变化。请自行保存你不能丢失的内容的副本。我们可能在合理通知后终止服务。"] },
        { id: "ending", title: "终止", body: ["你可以随时删除你的账户（网页的“安全”页面，或 iPhone 应用的“更多 → 删除账户”）。我们可能暂停或关闭违反本条款的账户，并在可能时告知原因。"] },
        { id: "liability", title: "保证与责任", body: ["Task Portal 按“现状”提供，除法律要求的保证外不作其他保证。在法律允许的范围内，我们不对间接或后果性损失、数据或利润损失承担责任。本条款中的任何内容都不限制法律规定不得限制的责任，也不影响你作为消费者的权利。"] },
        { id: "apple", title: "iPhone 应用", body: ["本条款是你与我们之间的约定，而非与 Apple 之间的约定。Apple 不对本应用或其内容负责，没有义务为其提供维护或支持，也不对与其相关的任何索赔负责。Apple 及其子公司是本条款的第三方受益人，可以对你执行本条款。"] },
        { id: "law", title: "适用法律", body: [`本条款受${law}的法律管辖，除非你所居住国家的法律赋予你援引该国法律的权利。`] },
        { id: "changes", title: "变更", body: ["本条款变更时，新版本会连同新日期发布在此页面。重大变更会在生效前通过应用或电子邮件通知；如果你此后继续使用 Task Portal，即表示你接受这些变更。"] },
        { id: "contact", title: "联系方式", body: [`关于本条款的问题：请${reach}。`] },
      ],
    },
  };
}
