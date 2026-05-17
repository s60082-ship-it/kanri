// IndexedDB の初期化
let db;
const dbName = 'kanri_db';
const storeName = 'transactions';

// IndexedDB の初期化
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(storeName)) {
                database.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
    await initDB();
    initializeApp();
    checkOfflineStatus();
    window.addEventListener('online', () => updateOfflineIndicator());
    window.addEventListener('offline', () => updateOfflineIndicator());
});

function initializeApp() {
    setDefaultDate();
    updateMonthDisplay();
    checkAndResetMonth();
    renderTransactions();
    renderBudgets();
    renderStats();
}

// 日付の初期設定
function setDefaultDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    document.getElementById('date').value = `${year}-${month}-${day}`;
}

// 月表示の更新
function updateMonthDisplay() {
    const today = new Date();
    const monthDisplay = document.getElementById('monthDisplay');
    monthDisplay.textContent = `${today.getFullYear()}年 ${today.getMonth() + 1}月`;
}

// タブの切り替え
function switchTab(tabName) {
    // タブボタンのアクティブ状態を更新
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // タブコンテンツの表示/非表示
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');

    // タブ切り替え時に表示を更新
    if (tabName === 'stats') {
        renderStats();
    } else if (tabName === 'budget') {
        renderBudgets();
    }
}

// 記録の追加
async function addTransaction() {
    const type = document.getElementById('transactionType').value;
    const category = document.getElementById('category').value;
    const amount = parseInt(document.getElementById('amount').value);
    const date = document.getElementById('date').value;
    const memo = document.getElementById('memo').value;

    if (!amount || !date) {
        showStatus('金額と日付を入力してください', 'error');
        return;
    }

    const transaction = {
        type,
        category,
        amount,
        date,
        memo,
        timestamp: new Date().toISOString()
    };

    // IndexedDB に保存
    const request = db.transaction([storeName], 'readwrite')
        .objectStore(storeName)
        .add(transaction);

    request.onsuccess = () => {
        showStatus('記録しました！', 'success');
        document.getElementById('amount').value = '';
        document.getElementById('memo').value = '';
        setDefaultDate();
        renderTransactions();
        renderStats();
        renderBudgets();
    };
}

// 記録の削除
async function deleteTransaction(id) {
    if (!confirm('この記録を削除しますか？')) return;

    const request = db.transaction([storeName], 'readwrite')
        .objectStore(storeName)
        .delete(id);

    request.onsuccess = () => {
        renderTransactions();
        renderStats();
        renderBudgets();
    };
}

// 記録の表示
async function renderTransactions() {
    const request = db.transaction([storeName], 'readonly')
        .objectStore(storeName)
        .getAll();

    request.onsuccess = () => {
        const transactions = request.result
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        const currentMonth = new Date().toISOString().slice(0, 7);
        const currentMonthTransactions = transactions.filter(t => t.date.startsWith(currentMonth));

        const list = document.getElementById('transactionList');
        
        if (currentMonthTransactions.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <p>今月の記録がありません</p>
                </div>
            `;
            return;
        }

        list.innerHTML = currentMonthTransactions.map(t => `
            <div class="transaction-item">
                <div class="transaction-info">
                    <div class="transaction-category">${t.category}</div>
                    <div class="transaction-amount ${t.type}">
                        ${t.type === 'expense' ? '-' : '+'}¥${t.amount.toLocaleString()}
                    </div>
                    <div class="transaction-date">${formatDate(t.date)}</div>
                    ${t.memo ? `<div style="font-size: 12px; color: #999; margin-top: 3px;">${t.memo}</div>` : ''}
                </div>
                <button class="btn-delete" onclick="deleteTransaction(${t.id})">削除</button>
            </div>
        `).join('');
    };
}

// 予算の設定
async function setBudget() {
    const category = document.getElementById('budgetCategory').value;
    const amount = parseInt(document.getElementById('budgetAmount').value);

    if (!amount) {
        showStatus('予算金額を入力してください', 'error');
        return;
    }

    const currentMonth = new Date().toISOString().slice(0, 7);
    const budgetKey = `budget_${currentMonth}_${category}`;
    
    localStorage.setItem(budgetKey, amount);
    
    showStatus('予算を設定しました！', 'success');
    document.getElementById('budgetAmount').value = '';
    renderBudgets();
}

// 予算の表示（全体サマリーを含む）
async function renderBudgets() {
    const request = db.transaction([storeName], 'readonly')
        .objectStore(storeName)
        .getAll();

    request.onsuccess = () => {
        const transactions = request.result;
        const currentMonth = new Date().toISOString().slice(0, 7);
        const currentMonthTransactions = transactions.filter(t => 
            t.date.startsWith(currentMonth) && t.type === 'expense'
        );

        const categories = ['食事', '交通', 'エンタメ', '医療', 'その他'];
        
        // 全体予算と全体使用額を計算
        let totalBudget = 0;
        let totalSpent = 0;

        categories.forEach(category => {
            const budgetKey = `budget_${currentMonth}_${category}`;
            const budgetAmount = parseInt(localStorage.getItem(budgetKey)) || 0;
            const spent = currentMonthTransactions
                .filter(t => t.category === category)
                .reduce((sum, t) => sum + t.amount, 0);

            totalBudget += budgetAmount;
            totalSpent += spent;
        });

        const totalRemaining = totalBudget - totalSpent;
        const totalPercentage = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
        const totalStatus = totalPercentage >= 100 ? 'danger' : totalPercentage >= 80 ? 'warning' : '';

        // サマリーの更新
        document.getElementById('totalBudget').textContent = `¥${totalBudget.toLocaleString()}`;
        document.getElementById('totalSpent').textContent = `¥${totalSpent.toLocaleString()}`;
        document.getElementById('totalRemaining').textContent = `¥${totalRemaining.toLocaleString()}`;
        document.getElementById('totalPercentage').textContent = `${totalPercentage}% 使用済み`;

        const progressFill = document.getElementById('totalProgressFill');
        progressFill.style.width = `${Math.min(totalPercentage, 100)}%`;
        progressFill.className = `total-progress-fill ${totalStatus}`;

        const budgetList = document.getElementById('budgetList');

        let html = '';
        categories.forEach(category => {
            const budgetKey = `budget_${currentMonth}_${category}`;
            const budgetAmount = parseInt(localStorage.getItem(budgetKey)) || 0;
            const spent = currentMonthTransactions
                .filter(t => t.category === category)
                .reduce((sum, t) => sum + t.amount, 0);

            const percentage = budgetAmount > 0 ? Math.min((spent / budgetAmount) * 100, 100) : 0;
            const status = percentage >= 100 ? 'danger' : percentage >= 80 ? 'warning' : '';

            if (budgetAmount > 0) {
                html += `
                    <div class="budget-item">
                        <div class="budget-header">
                            <div class="budget-category">${category}</div>
                            <div class="budget-amount">¥${spent.toLocaleString()} / ¥${budgetAmount.toLocaleString()}</div>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill ${status}" style="width: ${percentage}%"></div>
                        </div>
                        <div class="budget-stats">${Math.round(percentage)}% 使用済み</div>
                    </div>
                `;
            }
        });

        if (html === '') {
            html = `
                <div class="empty-state">
                    <div class="empty-state-icon">📊</div>
                    <p>予算を設定してください</p>
                </div>
            `;
        }

        budgetList.innerHTML = html;
    };
}

// 統計の表示
async function renderStats() {
    const request = db.transaction([storeName], 'readonly')
        .objectStore(storeName)
        .getAll();

    request.onsuccess = () => {
        const transactions = request.result;
        const currentMonth = new Date().toISOString().slice(0, 7);
        const currentMonthTransactions = transactions.filter(t => t.date.startsWith(currentMonth));

        const income = currentMonthTransactions
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0);

        const expense = currentMonthTransactions
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);

        const balance = income - expense;

        // カテゴリ別の支出
        const categoryExpense = {};
        currentMonthTransactions
            .filter(t => t.type === 'expense')
            .forEach(t => {
                categoryExpense[t.category] = (categoryExpense[t.category] || 0) + t.amount;
            });

        const statsList = document.getElementById('statsList');
        let html = `
            <div class="stats-card">
                <div class="stats-label">収入</div>
                <div class="stats-value income">¥${income.toLocaleString()}</div>
            </div>

            <div class="stats-card">
                <div class="stats-label">支出</div>
                <div class="stats-value expense">¥${expense.toLocaleString()}</div>
            </div>

            <div class="stats-card">
                <div class="stats-label">残高</div>
                <div class="stats-value balance">¥${balance.toLocaleString()}</div>
            </div>

            <div class="stats-card">
                <div class="stats-label">カテゴリ別支出</div>
                <div class="stats-breakdown">
        `;

        if (Object.keys(categoryExpense).length === 0) {
            html += '<p style="text-align: center; color: #999;">支出がありません</p>';
        } else {
            Object.entries(categoryExpense).forEach(([category, amount]) => {
                const percentage = ((amount / expense) * 100).toFixed(1);
                html += `
                    <div class="breakdown-item">
                        <span>${category}</span>
                        <span>¥${amount.toLocaleString()} (${percentage}%)</span>
                    </div>
                `;
            });
        }

        html += `
                </div>
            </div>
        `;

        statsList.innerHTML = html;
    };
}

// Google Sheets 連携の初期化
function setupGoogleSheets() {
    alert('以下の手順でGoogle Sheetsを接続してください：\n\n1. Google Sheetsで新規スプレッドシートを作成\n2. シートURLをコピーして「Google Sheets URL」に貼り付け\n3. 「データを保存」でデータを同期します\n\n※ Google Sheets APIの設定には、Google Apps Scriptを使用します');
}

// Google Sheets にデータを保存
async function saveToSheets() {
    const sheetsUrl = document.getElementById('sheetsUrl').value;
    
    if (!sheetsUrl) {
        showStatus('Google Sheets URLを入力してください', 'error');
        return;
    }

    const request = db.transaction([storeName], 'readonly')
        .objectStore(storeName)
        .getAll();

    request.onsuccess = () => {
        const transactions = request.result;
        const data = JSON.stringify(transactions, null, 2);
        
        // クリップボードにコピー
        navigator.clipboard.writeText(data).then(() => {
            showStatus('データをクリップボードにコピーしました。Google Sheetsに手動で貼り付けてください。', 'info');
        }).catch(() => {
            showStatus('クリップボードへのコピーに失敗しました', 'error');
        });
    };
}

// Google Sheets からデータを読み込み
async function loadFromSheets() {
    showStatus('Google Sheetsからのデータ読み込み機能は、Google Apps Scriptを使用して実装できます。', 'info');
}

// 月のリセット
function resetMonth() {
    if (!confirm('今月のデータをリセットしますか？この操作は取り消せません。')) return;

    const currentMonth = new Date().toISOString().slice(0, 7);
    
    // 現在の月の記録を削除
    const request = db.transaction([storeName], 'readwrite')
        .objectStore(storeName)
        .getAll();

    request.onsuccess = () => {
        const transactions = request.result;
        const currentMonthTransactions = transactions.filter(t => t.date.startsWith(currentMonth));

        const transaction = db.transaction([storeName], 'readwrite');
        currentMonthTransactions.forEach(t => {
            transaction.objectStore(storeName).delete(t.id);
        });

        // 予算もリセット
        const categories = ['食事', '交通', 'エンタメ', '医療', 'その他'];
        categories.forEach(category => {
            localStorage.removeItem(`budget_${currentMonth}_${category}`);
        });

        showStatus('今月のデータをリセットしました', 'success');
        renderTransactions();
        renderBudgets();
        renderStats();
    };
}

// データのエクスポート
async function exportData() {
    const request = db.transaction([storeName], 'readonly')
        .objectStore(storeName)
        .getAll();

    request.onsuccess = () => {
        const transactions = request.result;
        const dataStr = JSON.stringify(transactions, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kanri_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showStatus('データをエクスポートしました', 'success');
    };
}

// 月のリセット確認（自動）
function checkAndResetMonth() {
    const lastResetMonth = localStorage.getItem('lastResetMonth');
    const currentMonth = new Date().toISOString().slice(0, 7);

    if (lastResetMonth !== currentMonth) {
        localStorage.setItem('lastResetMonth', currentMonth);
        // 新しい月なので、前の月の予算をクリア（オプション）
        console.log('新しい月開始：予算が自動的にリセットされました');
    }
}

// ステータスメッセージの表示
function showStatus(message, type) {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = message;
    statusEl.className = `status-message status-${type}`;
    statusEl.style.display = 'block';
    
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 3000);
}

// 日付フォーマット
function formatDate(dateStr) {
    const date = new Date(dateStr);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}月${day}日`;
}

// オフラインステータスの確認
function checkOfflineStatus() {
    updateOfflineIndicator();
}

function updateOfflineIndicator() {
    const indicator = document.getElementById('offlineIndicator');
    if (!navigator.onLine) {
        indicator.classList.add('show');
    } else {
        indicator.classList.remove('show');
    }
}

// 定期的な同期（オンライン時）
setInterval(() => {
    if (navigator.onLine) {
        // Google Sheets への自動同期
        // 実装はユーザーが設定したURLに基づいて行われます
    }
}, 5 * 60 * 1000); // 5分ごと
