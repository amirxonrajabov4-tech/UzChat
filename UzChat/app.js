// O'zgaruvchilar
let currentNickname = localStorage.getItem("uzchat_nickname") || "";
let lastMessageTime = 0;
let replyingTo = null;
let blockedUsers = [];
let isAdmin = false;

// Elementlar
const loginBox = document.getElementById("loginBox");
const chatBox = document.getElementById("chatBox");
const nicknameInput = document.getElementById("nickname");
const joinBtn = document.getElementById("joinBtn");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const messagesDiv = document.getElementById("messages");
const onlineUsersEl = document.getElementById("onlineUsers");
const emojiBtn = document.getElementById("emojiBtn");
const emojiPicker = document.getElementById("emojiPicker");
const replyBox = document.getElementById("replyBox");
const replyToName = document.getElementById("replyToName");
const closeReply = document.getElementById("closeReply");
const searchBtn = document.getElementById("searchBtn");
const searchInput = document.getElementById("searchInput");

// Avtomatik kirish
if (currentNickname) {
    loginBox.classList.add("hidden");
    chatBox.classList.remove("hidden");
    loadMessages();
    trackOnlineUsers();
}

// Kirish tugmasi
joinBtn.addEventListener("click", () => {
    const name = nicknameInput.value.trim();
    if (name.length < 2) {
        alert("Taxallus kamida 2 ta belgidan iborat bo'lsin!");
        return;
    }
    currentNickname = name;
    localStorage.setItem("uzchat_nickname", name);
    loginBox.classList.add("hidden");
    chatBox.classList.remove("hidden");
    loadMessages();
    trackOnlineUsers();
    updateOnlineStatus(true);
});

// Xabar yuborish
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    // Spamdan himoya
    const now = Date.now();
    if (now - lastMessageTime < 1500) {
        alert("Iltimos, ozgina kuting!");
        return;
    }
    lastMessageTime = now;

    // Bloklangan foydalanuvchilar tekshiruvi
    if (blockedUsers.includes(currentNickname)) return;

    const newMessage = {
        nickname: currentNickname,
        text: text,
        reply_to: replyingTo,
        created_at: new Date().toISOString(),
    };

    supabase
        .from("messages")
        .insert([newMessage])
        .then(() => {
            messageInput.value = "";
            replyingTo = null;
            replyBox.classList.add("hidden");
        })
        .catch((err) => console.error("Xabar yuborishda xato:", err));
}

sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
});

// Xabarlarni yuklash va real vaqt yangilash
function loadMessages() {
    supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: true })
        .then((res) => {
            renderMessages(res.data);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });

    // Real vaqt tinglash
    supabase
        .channel("public:messages")
        .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "messages" },
            (payload) => {
                addMessage(payload.new);
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            },
        )
        .subscribe();
}

// Xabarlarni ko'rsatish
function renderMessages(messages) {
    messagesDiv.innerHTML = "";
    messages.forEach((msg) => addMessage(msg));
}

function addMessage(msg) {
    if (blockedUsers.includes(msg.nickname)) return;

    const isOwn = msg.nickname === currentNickname;
    const time = new Date(msg.created_at).toLocaleTimeString("uz-UZ", {
        hour: "2-digit",
        minute: "2-digit",
    });

    const msgEl = document.createElement("div");
    msgEl.className = `message ${isOwn ? "own-message" : "other-message"}`;

    // Javob qismi
    let replyHtml = "";
    if (msg.reply_to) {
        replyHtml = `<div class="reply-preview">↳ ${msg.reply_to.nickname}: ${msg.reply_to.text.substring(0, 50)}${msg.reply_to.text.length > 50 ? "..." : ""}</div>`;
    }

    msgEl.innerHTML = `
        ${replyHtml}
        <div class="message-header">
            <span>${msg.nickname}</span>
            <span class="time">${time}</span>
        </div>
        <div class="message-text">${msg.text}</div>
        <div class="message-actions">
            <button onclick="startReply('${msg.nickname}', '${msg.text.replace(/'/g, "\\'")}')">↪ Javob</button>
            ${
                isAdmin
                    ? `
                <button onclick="deleteMessage('${msg.id}')">🗑 O'chirish</button>
                <button onclick="blockUser('${msg.nickname}')">🚫 Bloklash</button>
            `
                    : ""
            }
        </div>
    `;

    messagesDiv.appendChild(msgEl);
}

// Javob yozish
window.startReply = function (nick, text) {
    replyingTo = { nickname: nick, text: text };
    replyToName.textContent = nick;
    replyBox.classList.remove("hidden");
    messageInput.focus();
};

closeReply.addEventListener("click", () => {
    replyingTo = null;
    replyBox.classList.add("hidden");
});

// Emoji tanlash
emojiBtn.addEventListener("click", () => {
    emojiPicker.classList.toggle("hidden");
});

emojiPicker.addEventListener("click", (e) => {
    if (e.target.tagName === "SPAN") {
        messageInput.value += e.target.textContent;
        emojiPicker.classList.add("hidden");
        messageInput.focus();
    }
});

// Onlayn foydalanuvchilar
function trackOnlineUsers() {
    setInterval(async () => {
        const { count } = await supabase
            .from("online")
            .select("*", { count: "exact", head: true });
        onlineUsersEl.textContent = count || 0;
    }, 3000);
}

async function updateOnlineStatus(isOnline) {
    if (isOnline) {
        await supabase
            .from("online")
            .upsert({
                nickname: currentNickname,
                last_seen: new Date().toISOString(),
            });
    } else {
        await supabase.from("online").delete().eq("nickname", currentNickname);
    }
}

window.addEventListener("beforeunload", () => updateOnlineStatus(false));

// Qidiruv
searchBtn.addEventListener("click", () => {
    searchInput.classList.toggle("hidden");
    searchInput.focus();
});

searchInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll(".message").forEach((msg) => {
        const text = msg.textContent.toLowerCase();
        msg.style.display = text.includes(term) ? "flex" : "none";
    });
});

// Admin funksiyalari
window.deleteMessage = async function (id) {
    if (confirm("Xabarni o'chirishni xohlaysizmi?")) {
        await supabase.from("messages").delete().eq("id", id);
        loadMessages();
    }
};

window.blockUser = function (nick) {
    if (confirm(`${nick} ni bloklashni xohlaysizmi?`)) {
        blockedUsers.push(nick);
        localStorage.setItem("uzchat_blocked", JSON.stringify(blockedUsers));
        loadMessages();
    }
};

// Bloklanganlarni yuklash
blockedUsers = JSON.parse(localStorage.getItem("uzchat_blocked") || "[]");
console.log("Supabase ishladi!");

console.log(supabase);
