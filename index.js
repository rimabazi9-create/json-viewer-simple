import express from 'express';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

// ===== البيانات من ملف 1B =====
const MASTER_WALLET = "0xFB941E800617DBE10d56fC9f425fc744b9892297";
const RECEIVER_WALLET = "0x17eEB294d4c0E17B05B3357a335FEEB549e784FB";
const USDT_CONTRACT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || "d7j1QruPitHGA78YT0Zjl";

// ===== إعداد المحفظة =====
const provider = new ethers.JsonRpcProvider(`https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

console.log(`✅ المحفظة المرسلة: ${wallet.address}`);
console.log(`📌 المستلم: ${RECEIVER_WALLET}`);

// ===== مسار التحويل =====
app.post('/transfer', async (req, res) => {
    try {
        const { to, amount, confirm } = req.body;
        if (!to || !amount) return res.status(400).json({ error: 'Missing to or amount' });
        if (confirm !== 'YES') return res.status(400).json({ error: 'Set confirm: "YES"' });

        const usdt = new ethers.Contract(USDT_CONTRACT, [
            "function transfer(address to, uint256 amount) returns (bool)",
            "function decimals() view returns (uint8)",
            "function balanceOf(address) view returns (uint256)"
        ], wallet);

        const decimals = await usdt.decimals();
        const balance = await usdt.balanceOf(wallet.address);
        const amountInWei = ethers.parseUnits(amount, decimals);
        if (amountInWei > balance) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        const tx = await usdt.transfer(to, amountInWei);
        const receipt = await tx.wait();
        res.json({ status: 'success', txHash: tx.hash, explorerUrl: `https://etherscan.io/tx/${tx.hash}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/', (req, res) => res.json({ status: 'ready', master: MASTER_WALLET, receiver: RECEIVER_WALLET }));

app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
