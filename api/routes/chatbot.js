const express = require('express');
const fs = require('fs');
const axios = require('axios');
const router = express.Router();

const FLOW_FILE = './data/flow.json';
const CONVERSATIONS_FILE = './data/conversations.json';

const flow = JSON.parse(fs.readFileSync(FLOW_FILE, 'utf8'));

/**
 * Função para normalizar strings (remover acentos e transformar em minúsculas)
 */
const normalizeText = (text) => {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

/**
 * Carrega ou inicializa o arquivo de conversas
 */
const loadConversations = () => {
    if (!fs.existsSync(CONVERSATIONS_FILE)) {
        fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify({}), 'utf8');
    }
    return JSON.parse(fs.readFileSync(CONVERSATIONS_FILE, 'utf8'));
};

const saveConversations = (conversations) => {
    fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(conversations, null, 2), 'utf8');
};

/**
 * Substitui variáveis dentro das mensagens (ex: {{name}})
 */
const replaceVariables = (text, variables) => {
    return text.replace(/\{\{(.*?)\}\}/g, (match, variable) => {
        return variables[variable] || match;
    });
};

/**
 * Verifica se a mensagem do usuário é um greeting
 */
const isGreeting = (message) => {
    const normalizedMessage = normalizeText(message);
    return flow.greetings.some(greet => normalizeText(greet) === normalizedMessage);
};

/**
 * @swagger
 * /chatbot/message:
 *   post:
 *     summary: Processa a mensagem do usuário e retorna a próxima etapa do chatbot.
 *     description: 
 *       O chatbot segue um fluxo de conversa baseado em um JSON. Ele pode capturar dados, validar respostas, 
 *       reconhecer sinônimos, armazenar informações do usuário e encaminhar mensagens para uma API externa após o escalonamento.
 *       Se o bot estiver no estado "escalate", ele apenas repassa a mensagem para a API externa e retorna a resposta.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - message
 *             properties:
 *               user_id:
 *                 type: string
 *                 example: "user123"
 *                 description: "Identificador único do usuário"
 *               message:
 *                 type: string
 *                 example: "Oi"
 *                 description: "Mensagem enviada pelo usuário"
 *     responses:
 *       200:
 *         description: Responde com a próxima etapa do chatbot ou encaminha a mensagem para a API externa se estiver no estado 'escalate'.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Olá! Tudo bem? Qual é o seu nome?"
 *                 options:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       text:
 *                         type: string
 *                         example: "Sim"
 *                       next:
 *                         type: string
 *                         example: "support"
 *       400:
 *         description: Erro caso os parâmetros obrigatórios não sejam enviados.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Parâmetros 'user_id' e 'message' são obrigatórios"
 *       500:
 *         description: Erro interno caso haja um problema no processamento.
 */
/**
 * Substitui variáveis dentro das mensagens (ex: {{name}})
 */

router.post('/message', async (req, res) => {
    const { user_id, message } = req.body;
    if (!user_id || !message) {
        return res.status(400).json({ error: "Parâmetros 'user_id' e 'message' são obrigatórios" });
    }

    let conversations = loadConversations();
    let userState = conversations[user_id];
    let normalizedMessage = normalizeText(message);

    // 🔥 Se for um novo usuário, inicializa SEM capturar nada ainda
    if (!userState) {
        userState = { currentStep: "start", history: ["start"], variables: {} };
        conversations[user_id] = userState;
        saveConversations(conversations);

        return res.json({
            message: "Olá! Tudo bem? Qual é o seu nome?"
        });
    }

    let currentStep = flow.steps.find(step => step.id === userState.currentStep);
    if (!currentStep) {
        return res.status(500).json({ error: "Erro interno: estado inválido" });
    }

    // 🔥 Se o usuário já passou pelo onboarding, manda direto pro menu ao dizer "Oi"
    if (isGreeting(normalizedMessage) && userState.variables.name && userState.variables.choice) {
        userState.currentStep = "menu";
        userState.history.push("menu");
        conversations[user_id] = userState;
        saveConversations(conversations);

        let menuStep = flow.steps.find(step => step.id === "menu");
        return res.json({
            message: replaceVariables(menuStep.messages[0], userState.variables),
            options: menuStep.options
        });
    }

    // 🔥 Se estamos no start, capturamos apenas o nome
    if (userState.currentStep === "start") {
        if (normalizedMessage.includes(" ")) {
            return res.json({ message: "Digite apenas seu primeiro nome." });
        }

        userState.variables.name = message;
        userState.currentStep = "preference";
        userState.history.push("preference");
        conversations[user_id] = userState;
        saveConversations(conversations);

        return res.json({ message: "Você prefere A, B ou C?" });
    }

    // 🔥 Se estamos esperando a escolha A, B ou C
    if (userState.currentStep === "preference") {
        let validChoices = ["a", "b", "c"];
        if (!validChoices.includes(normalizedMessage)) {
            return res.json({ message: "Por favor, escolha entre A, B ou C." });
        }

        userState.variables.choice = message;
        userState.currentStep = "menu";
        userState.history.push("menu");
        conversations[user_id] = userState;
        saveConversations(conversations);

        let menuStep = flow.steps.find(step => step.id === "menu");
        return res.json({
            message: replaceVariables(menuStep.messages[0], userState.variables),
            options: menuStep.options
        });
    }

    return res.status(500).json({ error: "Erro inesperado no fluxo." });
});

module.exports = router;
