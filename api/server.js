const express = require('express');
const bodyParser = require('body-parser');
const chatbotRoutes = require('./routes/chatbot');
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
app.use(bodyParser.json());

// Configuração do Swagger
const swaggerOptions = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Chatbot API",
            version: "1.0.0",
            description: "API para um chatbot baseado em fluxo de conversação definido via JSON"
        },
        servers: [{ url: "http://localhost:3000" }]
    },
    apis: ["./routes/chatbot.js"]
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Rotas
app.use('/chatbot', chatbotRoutes);

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Swagger Docs available at http://localhost:${PORT}/api-docs`);
});
