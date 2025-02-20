function generateFlowUrl(flowJson) {
    const encodedData = encodeURIComponent(JSON.stringify(flowJson));
    return `https://zapflow.visual.builder.ekz.com.br/?data=${encodedData}`;
  }
  
  // 🔹 Exemplo de uso:
  const flowJson = require("../../api/data/lvGalvao_onboarding.json");
  
  // 🔹 Gera a URL:
  const url = generateFlowUrl(flowJson);
  console.log("URL Gerada:", url);
  
