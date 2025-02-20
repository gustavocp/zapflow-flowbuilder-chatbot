import React, { useState, useMemo, useRef } from "react";
import ReactFlow, {
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  addEdge
} from "reactflow";
import "reactflow/dist/style.css";

// =================== Nó customizado (cores) ===================
const CustomNode = ({ data }) => {
  const backgroundColor =
    data.type === "bot" ? "#d4f7d4" : // verde claro
    data.type === "user" ? "#f0f0f0" : // cinza claro
    "#fff";

  return (
    <div style={{ border: "1px solid #999", borderRadius: 6, background: backgroundColor, padding: 10 }}>
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

// =================== Converter JSON (carregado) => Nodes/Edges ===================
// Converte o objeto JSON do fluxo para nós e arestas usados pelo React Flow.
function convertChatbotFlowToNodesAndEdges(flow) {
  const nodes = [];
  const edges = [];

  // A posição vertical é determinada pela ordem do array de steps
  flow.steps.forEach((step, index) => {
    const baseY = index * 200;

    // Nó principal
    nodes.push({
      id: step.id,
      type: "customNode",
      position: { x: 200, y: baseY },
      data: {
        label: step.messages?.[0] || "Mensagem",
        type: step.options ? "user" : "bot",
        capture: step.capture || null,
        validation: step.validation || null,
        error_message: step.error_message || null,
        options: step.options || [],
        stepId: step.id
      }
    });

    // Se houver captura, cria o nó "Usuário responde"
    if (step.capture) {
      const userNodeId = `${step.id}_response`;
      nodes.push({
        id: userNodeId,
        type: "customNode",
        position: { x: 200, y: baseY + 100 },
        data: {
          label: "Usuário responde...",
          type: "user",
          stepId: userNodeId
        }
      });
      edges.push({
        id: `edge-${step.id}-${userNodeId}`,
        source: step.id,
        target: userNodeId
      });
      if (step.next) {
        edges.push({
          id: `edge-${userNodeId}-${step.next}`,
          source: userNodeId,
          target: step.next
        });
      }
    } else if (step.next) {
      edges.push({
        id: `edge-${step.id}-${step.next}`,
        source: step.id,
        target: step.next
      });
    }

    // Se houver opções, cada opção gera uma aresta
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

// =================== Converter Nodes/Edges => JSON ===================
// Converte os nós e arestas atuais para o objeto JSON do fluxo.
function convertNodesAndEdgesToChatbotFlow(nodes, edges) {
  const stepMap = {};
  const order = [];

  // Processa os nós, garantindo que cada nó válido crie uma entrada
  nodes.filter((node) => node && node.data).forEach((node) => {
    const stepId = node.data.stepId || node.id;
    if (!stepId) return;
    if (!order.includes(stepId)) order.push(stepId);
    const isResponseNode = stepId.endsWith("_response");
    if (!isResponseNode) {
      stepMap[stepId] = {
        id: stepId,
        messages: [node.data.label || ""],
        capture: node.data.capture || null,
        validation: node.data.validation || null,
        error_message: node.data.error_message || null,
        options: node.data.options || []
      };
    } else {
      const originalStepId = stepId.replace("_response", "");
      if (!order.includes(originalStepId)) order.push(originalStepId);
      if (!stepMap[originalStepId]) {
        // Cria uma entrada padrão se não existir
        stepMap[originalStepId] = { id: originalStepId, messages: [] };
      }
      stepMap[originalStepId].capture = stepMap[originalStepId].capture || "algum_capture";
    }
  });

  // Processa as arestas para definir o campo "next"
  edges.forEach((edge) => {
    const { source, target } = edge;
    const sourceIsResponse = source.endsWith("_response");
    const targetIsResponse = target.endsWith("_response");

    if (!sourceIsResponse && !targetIsResponse && stepMap[source] && stepMap[target]) {
      if (!stepMap[source].options || stepMap[source].options.length === 0) {
        stepMap[source].next = target;
      } else {
        const foundOpt = (stepMap[source].options || []).find((o) => o.next === target);
        if (!foundOpt) {
          stepMap[source].next = target;
        }
      }
    }

    if (sourceIsResponse && !targetIsResponse && stepMap[target]) {
      const original = source.replace("_response", "");
      if (!stepMap[original]) {
        stepMap[original] = { id: original, messages: [] };
      }
      stepMap[original].next = target;
    }
  });

  // Cria o array de steps a partir da ordem, filtrando entradas indefinidas
  const steps = order
    .map((stepId) => {
      const st = stepMap[stepId];
      if (!st) return null;
      return {
        id: st.id,
        messages: st.messages || [],
        capture: st.capture || undefined,
        validation: st.validation || undefined,
        error_message: st.error_message || undefined,
        next: st.next || undefined,
        options: st.options || []
      };
    })
    .filter((s) => s !== null);

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

// =================== Estados Iniciais ===================
// Inicia com um único nó "Welcome"
const initialNodes = [
  {
    id: "welcome",
    type: "customNode",
    position: { x: 300, y: 100 },
    data: { label: "Welcome", type: "bot", stepId: "welcome" }
  }
];
const initialEdges = [];

// =================== Componente Principal ===================
export default function FlowEditor() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    initialEdges.map((e) => ({
      ...e,
      type: "deleteEdge",
      data: { onDeleteEdge: handleDeleteEdge }
    }))
  );

  // Modal para edição
  const [selectedNode, setSelectedNode] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nodeLabel, setNodeLabel] = useState("");

  // =================== Funções de Arestas ===================
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

  // =================== Função para Novo Nó ===================
  const handleNewNode = () => {
    const newId = `newNode_${Date.now()}`;
    const newNode = {
      id: newId,
      type: "customNode",
      position: { x: 200, y: 200 },
      data: {
        label: "Novo nó",
        type: "bot",
        stepId: newId
      }
    };
    setNodes((nds) => [...nds, newNode]);
  };

  // =================== Modal de Edição ===================
  const handleNodeClick = (event, node) => {
    event.stopPropagation();
    setSelectedNode(node);
    setNodeLabel(node.data.label || "");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedNode(null);
  };

  const saveNodeChanges = () => {
    if (!selectedNode) return;
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id === selectedNode.id) {
          return {
            ...n,
            data: {
              ...n.data,
              label: nodeLabel
            }
          };
        }
        return n;
      })
    );
    closeModal();
  };

  const handleDeleteNode = () => {
    if (!selectedNode) return;
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    closeModal();
  };

  // =================== Salvar / Carregar JSON ===================
  const handleSaveJson = () => {
    const result = convertNodesAndEdgesToChatbotFlow(nodes, edges);
    downloadJSON(result, "chatbotFlow.json");
  };

  const fileInputRef = useRef(null);
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

      {/* Modal centralizado */}
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
              width: 300,
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
                rows={4}
                value={nodeLabel}
                onChange={(e) => setNodeLabel(e.target.value)}
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <div style={{ marginTop: 10, textAlign: "right" }}>
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

      {/* CSS para o "x" da aresta aparecer no hover */}
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
