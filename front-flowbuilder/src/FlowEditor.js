import React, { useState, useRef, useEffect } from "react";
import ReactFlow, {
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position
} from "reactflow";
import "reactflow/dist/style.css";

// =================== Nó customizado (cores e quebra de linha) ===================
const CustomNode = ({ data }) => {
  // Define cores conforme o tipo do nó
  let backgroundColor = "#f0f0f0";
  if (data.nodeType === "Mensagem") backgroundColor = "#d4f7d4";
  if (data.nodeType === "Espera") backgroundColor = "#d9d9d9";

  return (
    <div
      style={{
        border: "1px solid #999",
        borderRadius: 6,
        background: backgroundColor,
        padding: 10,
        maxWidth: 300,         // Limita a largura do card
        whiteSpace: "pre-wrap" // Preserva quebras de linha
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div>
        <strong>{data.label || "Sem título"}</strong>
      </div>
      {data.options && data.options.length > 0 && (
        <ul style={{ marginTop: 10, paddingLeft: 18 }}>
          {data.options.map((opt, idx) => (
            <li key={idx}>{opt.text}</li>
          ))}
        </ul>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

// =================== Aresta customizada com "X" no hover ===================
const DeleteEdge = (props) => {
  const { id, sourceX, sourceY, targetX, targetY, markerEnd, data } = props;
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;

  return (
    <g className="edge-group">
      <path
        id={id}
        d={`M ${sourceX},${sourceY} L ${targetX},${targetY}`}
        stroke="#999"
        strokeWidth={2}
        markerEnd={markerEnd}
        style={{ pointerEvents: "all", cursor: "pointer" }}
        onClick={(e) => {
          e.stopPropagation();
          if (window.confirm(`Deseja excluir a aresta [${id}]?`)) {
            data.onDeleteEdge(id);
          }
        }}
      />
      <foreignObject
        x={midX}
        y={midY}
        width={20}
        height={20}
        style={{ transform: "translate(-50%, -50%)", cursor: "pointer" }}
        requiredExtensions="http://www.w3.org/1999/xhtml"
      >
        <div
          className="edge-delete"
          style={{
            width: 20,
            height: 20,
            background: "white",
            border: "1px solid #333",
            borderRadius: "50%",
            fontSize: 14,
            textAlign: "center",
            lineHeight: "20px"
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Deseja excluir a aresta [${id}]?`)) {
              data.onDeleteEdge(id);
            }
          }}
        >
          x
        </div>
      </foreignObject>
    </g>
  );
};

const nodeTypes = { customNode: CustomNode };
const edgeTypes = { deleteEdge: DeleteEdge };

// =================== Converter JSON -> Nodes/Edges ===================
function convertChatbotFlowToNodesAndEdges(flow) {
  const nodes = [];
  const edges = [];

  flow.steps.forEach((step, index) => {
    const baseY = index * 200;
    const position = step.position || { x: 200, y: baseY };

    nodes.push({
      id: step.id,
      type: "customNode",
      position,
      data: {
        label: step.messages?.[0] || "Mensagem",
        nodeType: step.nodeType || "Mensagem",
        options: step.options || [],
        stepId: step.id
      }
    });

    if (step.next) {
      edges.push({
        id: `edge-${step.id}-${step.next}`,
        source: step.id,
        target: step.next
      });
    }
    if (step.options) {
      step.options.forEach((opt, idx) => {
        edges.push({
          id: `edge-${step.id}-${opt.next}-${idx}`,
          source: step.id,
          target: opt.next
        });
      });
    }
  });

  return { nodes, edges };
}

// =================== Converter Nodes/Edges -> JSON ===================
function convertNodesAndEdgesToChatbotFlow(nodes, edges) {
  const steps = nodes.map((node) => ({
    id: node.id,
    messages: [node.data.label || ""],
    nodeType: node.data.nodeType || "Mensagem",
    next: edges.find((edge) => edge.source === node.id)?.target || undefined,
    options: node.data.options || [],
    position: node.position
  }));

  return { bot_name: "Assistente Virtual Exportado", steps };
}

// =================== Download JSON ===================
function downloadJSON(jsonData, filename) {
  const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// =================== Fluxo Padrão ===================
const defaultFlow = {
  bot_name: "Assistente Virtual Exportado",
  steps: [
    {
      id: "welcome",
      messages: ["Welcome"],
      nodeType: "Mensagem",
      position: { x: 300, y: 100 }
    }
  ]
};

export default function FlowEditor() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nodeLabel, setNodeLabel] = useState("");
  const [nodeType, setNodeType] = useState("Mensagem");
  const fileInputRef = useRef(null);

  // Ao montar, tenta carregar o fluxo via POST
  useEffect(() => {
    loadFlowViaGet();
  }, []);

  // =================== Tenta carregar JSON via POST ===================
  async function loadFlowViaPost() {
    try {
      // Faz POST para a mesma URL ou outro endpoint que retorne o JSON do fluxo
      const response = await fetch(window.location.href, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        // Se quiser enviar algo no body, faça:
        // body: JSON.stringify({ any: "data" })
      });

      if (!response.ok) {
        // Se o servidor não retornar 200 OK, usa fluxo padrão
        console.warn("Nenhum fluxo via POST. Usando defaultFlow.");
        setDefaultNodesAndEdges();
        return;
      }

      const flow = await response.json();
      console.log("Fluxo recebido via POST:", flow);

      const { nodes: loadedNodes, edges: loadedEdges } = convertChatbotFlowToNodesAndEdges(flow);
      setNodes(
        loadedNodes.map((n) => ({
          ...n,
          data: { ...n.data }
        }))
      );
      setEdges(
        loadedEdges.map((ed) => ({
          ...ed,
          type: "deleteEdge",
          data: { onDeleteEdge: handleDeleteEdge }
        }))
      );
    } catch (err) {
      console.error("Erro ao carregar fluxo via POST:", err);
      // Se der erro, usa fluxo padrão
      setDefaultNodesAndEdges();
    }
  }

  async function loadFlowViaGet() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const dataParam = urlParams.get("data");
  
      if (!dataParam) {
        console.warn("Nenhum fluxo via GET. Usando defaultFlow.");
        setDefaultNodesAndEdges();
        return;
      }
  
      // Decodifica o JSON que foi passado na URL
      const decodedFlowJson = JSON.parse(decodeURIComponent(dataParam));
      console.log("Fluxo recebido via GET:", decodedFlowJson);
  
      const { nodes: loadedNodes, edges: loadedEdges } = convertChatbotFlowToNodesAndEdges(decodedFlowJson);
  
      setNodes(
        loadedNodes.map((n) => ({
          ...n,
          data: { ...n.data }
        }))
      );
  
      setEdges(
        loadedEdges.map((ed) => ({
          ...ed,
          type: "deleteEdge",
          data: { onDeleteEdge: handleDeleteEdge }
        }))
      );
    } catch (err) {
      console.error("Erro ao carregar fluxo via GET:", err);
      setDefaultNodesAndEdges();
    }
  }


  
  // Se não carregou nada via POST, define o fluxo padrão
  function setDefaultNodesAndEdges() {
    const { nodes: defNodes, edges: defEdges } = convertChatbotFlowToNodesAndEdges(defaultFlow);
    setNodes(
      defNodes.map((n) => ({
        ...n,
        data: { ...n.data }
      }))
    );
    setEdges(
      defEdges.map((ed) => ({
        ...ed,
        type: "deleteEdge",
        data: { onDeleteEdge: handleDeleteEdge }
      }))
    );
  }

  // =================== Ações com arestas ===================
  function handleDeleteEdge(edgeId) {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
  }

  const handleConnect = (connection) => {
    const newEdge = {
      ...connection,
      id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
      type: "deleteEdge",
      data: { onDeleteEdge: handleDeleteEdge }
    };
    setEdges((eds) => addEdge(newEdge, eds));
  };

  // =================== Cria novo nó ===================
  const handleNewNode = () => {
    const newId = `newNode_${Date.now()}`;
    const newNode = {
      id: newId,
      type: "customNode",
      position: { x: 200, y: 200 },
      data: {
        label: "Novo nó",
        nodeType: "Mensagem"
      }
    };
    setNodes((nds) => [...nds, newNode]);
  };

  // =================== Organizar nós (vertical/horizontal) ===================
  const organizeVertical = () => {
    setNodes((nds) =>
      nds.map((node, index) => ({
        ...node,
        position: { x: 200, y: index * 150 + 100 }
      }))
    );
  };

  const organizeHorizontal = () => {
    setNodes((nds) =>
      nds.map((node, index) => ({
        ...node,
        position: { x: index * 300 + 200, y: 200 }
      }))
    );
  };

  // =================== Clique no nó -> abre modal ===================
  const handleNodeClick = (event, node) => {
    event.stopPropagation();
    setSelectedNode(node);
    setNodeLabel(node.data.label || "");
    setNodeType(node.data.nodeType || "Mensagem");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedNode(null);
  };

  // =================== Salva alterações do nó ===================
  const saveNodeChanges = () => {
    if (!selectedNode) return;
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id === selectedNode.id) {
          return {
            ...n,
            data: {
              ...n.data,
              label: nodeLabel,
              nodeType: nodeType
            }
          };
        }
        return n;
      })
    );
    closeModal();
  };

  // =================== Duplicar Nó ===================
  const handleDuplicateNode = () => {
    if (!selectedNode) return;
    const newId = `clone_${Date.now()}`;
    const offsetX = selectedNode.position.x + 50;
    const offsetY = selectedNode.position.y + 50;

    const newNode = {
      ...selectedNode,
      id: newId,
      position: { x: offsetX, y: offsetY },
      data: {
        ...selectedNode.data,
        label: nodeLabel,
        nodeType: nodeType
      }
    };

    setNodes((nds) => [...nds, newNode]);
    closeModal();
  };

  // =================== Excluir Nó ===================
  const handleDeleteNode = () => {
    if (!selectedNode) return;
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    closeModal();
  };

  // =================== Salvar / Baixar JSON ===================
  const handleSaveJson = () => {
    const result = convertNodesAndEdgesToChatbotFlow(nodes, edges);
    downloadJSON(result, "chatbotFlow.json");
  };

  // =================== Carregar JSON local ===================
  const handleLoadJson = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = null;
      fileInputRef.current.click();
    }
  };

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        const { nodes: newNodes, edges: newEdges } = convertChatbotFlowToNodesAndEdges(parsed);
        const typedEdges = newEdges.map((ed) => ({
          ...ed,
          type: "deleteEdge",
          data: { onDeleteEdge: handleDeleteEdge }
        }));
        setNodes(newNodes);
        setEdges(typedEdges);
      } catch (err) {
        console.error("Erro ao carregar JSON:", err);
        alert("Arquivo JSON inválido.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      {/* Botões de ação */}
      <div style={{ position: "absolute", zIndex: 10, left: 10, top: 10 }}>
        <button onClick={handleNewNode} style={{ marginRight: 10 }}>
          Novo Nó
        </button>
        <button onClick={handleSaveJson} style={{ marginRight: 10 }}>
          Baixar JSON
        </button>
        <button onClick={handleLoadJson} style={{ marginRight: 10 }}>
          Carregar JSON
        </button>
        <button onClick={organizeVertical} style={{ marginRight: 10 }}>
          Vertical
        </button>
        <button onClick={organizeHorizontal} style={{ marginRight: 10 }}>
          Horizontal
        </button>
        <input
          type="file"
          accept=".json"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={onFileChange}
        />
      </div>

      {/* React Flow */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={handleNodeClick}
        fitView
      >
        <Controls />
        <Background />
        <MiniMap />
      </ReactFlow>

      {/* Modal de Edição */}
      {isModalOpen && selectedNode && (
        <div
          onClick={closeModal}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0,0,0,0.5)",
            zIndex: 9999,
            display: "flex",
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              padding: 20,
              borderRadius: 8,
              width: 320,
              maxHeight: "80vh",
              overflowY: "auto",
              position: "relative"
            }}
          >
            <button
              onClick={closeModal}
              style={{
                position: "absolute",
                top: 5,
                right: 5,
                background: "transparent",
                border: "none",
                fontSize: 16,
                cursor: "pointer"
              }}
            >
              x
            </button>
            <h3>Editando nó: {selectedNode.id}</h3>
            <label style={{ display: "block", marginBottom: 8 }}>
              Texto:
              <textarea
                rows={6}
                value={nodeLabel}
                onChange={(e) => setNodeLabel(e.target.value)}
                style={{ width: "100%", marginTop: 4, resize: "vertical" }}
              />
            </label>
            <label style={{ display: "block", marginBottom: 8 }}>
              Tipo:
              <select
                value={nodeType}
                onChange={(e) => setNodeType(e.target.value)}
                style={{ width: "100%", marginTop: 4 }}
              >
                <option value="Mensagem">Mensagem</option>
                <option value="Resposta do Usuário">Resposta do Usuário</option>
                <option value="Espera">Espera</option>
                <option value="Chamada de Api">Chamada de Api</option>
              </select>
            </label>
            <div style={{ marginTop: 10, textAlign: "right" }}>
              <button onClick={handleDuplicateNode} style={{ marginRight: 10 }}>
                Duplicar
              </button>
              <button onClick={saveNodeChanges} style={{ marginRight: 10 }}>
                Salvar
              </button>
              <button onClick={handleDeleteNode} style={{ color: "red" }}>
                Excluir Nó
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS para exibir o "x" da aresta no hover */}
      <style>
        {`
          .edge-group:hover .edge-delete {
            opacity: 1;
          }
          .edge-delete {
            opacity: 0;
            transition: opacity 0.2s;
          }
        `}
      </style>
    </div>
  );
}
