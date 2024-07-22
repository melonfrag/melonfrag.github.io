const chatOutput = document.getElementById('chat-output');
const chatInput = document.getElementById('chat-input');

let socket;
let reconnectInterval = 5000; // 重连间隔，单位：毫秒
let nickname = "";
let ipAddress = "";
let history = [];
let historyIndex = -1;

function setupWebSocket() {
    socket = new WebSocket('ws://39.105.127.10:6022');

    socket.addEventListener('open', function() {
        displayMessage('Connected to server.');
        nickname = localStorage.getItem('nickname')
        nickname = prompt("Enter your nickname:", nickname) || nickname;
        if (nickname === "") {
            displayMessage("You didn't enter a nickname. You are disconnected.")
            socket.close(); // Close the socket if user cancels
            return; // Exit the function
        } else {
            localStorage.setItem('nickname', nickname);
            socket.send(JSON.stringify({"name": nickname}))
        }

        fetch('https://api.ipify.org?format=json')
            .then(response => response.json())
            .then(data => {
                ipAddress = data.ip;
            });
    });

    socket.addEventListener('message', function(event) {
        const data = event.data;
        displayMessage(data.slice(1, -1));
    });

    socket.addEventListener('close', function(event) {
        displayMessage('Connection closed. Reconnecting in 5 seconds...');
        setTimeout(setupWebSocket, reconnectInterval);
    });

    socket.addEventListener('error', function(event) {
        console.error('WebSocket error:', event);
        socket.close(); // Trigger the close event to attempt reconnect
    });
}


function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderMarkdown(text) {
    // Escape HTML tags
    text = escapeHtml(text);

    // Markdown rendering logic
    return text
        // Headers
        .replace(/^######\s*(.*)$/gm, '<h6>$1</h6>')
        .replace(/^#####\s*(.*)$/gm, '<h5>$1</h5>')
        .replace(/^####\s*(.*)$/gm, '<h4>$1</h4>')
        .replace(/^###\s*(.*)$/gm, '<h3>$1</h3>')
        .replace(/^##\s*(.*)$/gm, '<h2>$1</h2>')
        .replace(/^#\s*(.*)$/gm, '<h1>$1</h1>')
        // Bold
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\_\_(.*?)\_\_/g, '<strong>$1</strong>')
        // Italics
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\_(.*?)\_/g, '<em>$1</em>')
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
        // Lists
        .replace(/^\s*[\*\-\+]\s+(.*)$/gm, '<li>$1</li>')
        .replace(/<\/li>\n<li>/g, '</li><li>')
        .replace(/^(\s*<li>.*<\/li>\s*)+$/gm, '<ul>$&</ul>')
        .replace(/<ul>(.*?)<\/ul>/g, function (match, content) {
            return '<ul style="padding-left: 1em;">' + content + '</ul>';
        })
        .replace(/<li>(.*?)<\/li>/g, function (match, content) {
            return '<li style="margin-left: 1em;">' + content + '</li>';
        })
        // Blockquotes
        .replace(/^>\s+(.*)$/gm, '<blockquote style="border-left: 2px solid #ddd; padding-left: 1em;">$1</blockquote>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Tables
        .replace(/^\|(.+?)\|\s*$/gm, function (match, content) {
            const rows = content.split('|').map(row => row.trim()).filter(row => row.length > 0);
            const headers = rows[0].split(/[\|\s]+/).filter(cell => cell.length > 0);
            const data = rows.slice(1).map(row => row.split(/[\|\s]+/).filter(cell => cell.length > 0));
            return `<table style="border-collapse: collapse; width: 100%;"><thead><tr><th>${headers.join('</th><th>')}</th></tr></thead><tbody>${data.map(row => `<tr><td>${row.join('</td><td>')}</td></tr>`).join('')}</tbody></table>`;
        })
        // Strikethrough
        .replace(/~~(.*?)~~/g, '<del>$1</del>')
        // Subscript
        .replace(/~(.*?)~/g, '<sub>$1</sub>')
        // Superscript
        .replace(/\^(.*?)\^/g, '<sup>$1</sup>')
        // Footnotes
        .replace(/\[\^(.*?)\]\((.*?)\)/g, '<sup>$1</sup> <small>$2</small>')
        // Line breaks
        .replace(/\n/g, '<br>');
}


function renderLatex(text) {
    const latexContainer = document.createElement('div');
    latexContainer.innerHTML = `\\(${text}\\)`;
    chatOutput.appendChild(latexContainer);

    // Use KaTeX to render LaTeX
    try {
        katex.render(text, latexContainer, {
            throwOnError: false
        });
        chatOutput.scrollTop = chatOutput.scrollHeight;
    } catch (err) {
        console.error('KaTeX error:', err);
    }
}

function renderMarkdownCode(text){
    return text
        // Code blocks
        .replace(/CODE_BEGIN::([\s\S]*?)::CODE_END/g, '<pre><code>$1</code></pre>')
}

function displayMessage(message) {
    if(message){
        const messageElement = document.createElement('div');
        var index = message.indexOf(": ");
        console.log(message.substring(index+2, message.length).replace("\\n","\n"))
        if(message.includes("```")){
            messageContent = message.substring(0, index+2) + renderMarkdownCode(message.substring(index+2, message.length).replace(/\\n/g,"\n"))
                            .replace(/\\n/g, "<br>")
                            .replace(/\\"/g, '"')
                            .replace(/\\\\/g, '\\')
        } else {
            messageContent = message.substring(0, index+2) + renderMarkdown(message.substring(index+2, message.length).replace(/\\n/g,"\n"))
            .replace(/\\n/g, "<br>")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
            // Process LaTeX and replace only the LaTeX part
            if (messageContent.includes('$')) {
                const latexMatches = messageContent.match(/\$(.*?)\$/g);
                if (latexMatches) {
                    latexMatches.forEach(latex => {
                        const latexText = latex.replace(/\$/g, '');
                        const latexContainer = document.createElement('span');
                        latexContainer.className = 'latex-container';
                        try {
                            katex.render(latexText, latexContainer, {
                                throwOnError: false
                            });
                        } catch (err) {
                            console.error('KaTeX error:', err);
                        }

                        // Replace LaTeX placeholder with rendered content
                        messageContent = messageContent.replace(latex, latexContainer.outerHTML);
                    });
                }
            }
        }


        messageElement.innerHTML = messageContent;
        chatOutput.innerHTML += messageElement.outerHTML;
        chatOutput.scrollTop = chatOutput.scrollHeight;
    }
}



chatInput.addEventListener('keydown', function(event) {
    if (event.key === 'ArrowUp') {
        if (historyIndex > 0) {
            historyIndex--;
            chatInput.value = history[historyIndex];
            chatInput.selectionStart = chatInput.selectionEnd = chatInput.value.length;
        }
        event.preventDefault();
    } else if (event.key === 'ArrowDown') {
        if (historyIndex < history.length - 1) {
            historyIndex++;
            chatInput.value = history[historyIndex];
            chatInput.selectionStart = chatInput.selectionEnd = chatInput.value.length;
        } else {
            historyIndex = history.length;
            chatInput.value = '';
            chatInput.selectionStart = chatInput.selectionEnd = chatInput.value.length;
        }
        event.preventDefault();
    } else if (event.key === 'Enter' && event.ctrlKey) {
        event.preventDefault();
        const cursorPos = chatInput.selectionStart;
        const text = chatInput.value;
        chatInput.value = text.slice(0, cursorPos) + '\n' + text.slice(cursorPos);
        chatInput.selectionStart = chatInput.selectionEnd = cursorPos + 1;
    } else if (event.key === 'Enter' && !event.ctrlKey) {
        event.preventDefault();
        const message = chatInput.value.trim();
        if (message) {
            const formattedMessage = {
                sender: nickname,
                tripcode: ipAddress,
                msg: message
            };
            socket.send(JSON.stringify(formattedMessage));
            chatInput.value = '';
            history.push(message);
            historyIndex = history.length;
        }
    }
});

// Initialize WebSocket connection
setupWebSocket();
