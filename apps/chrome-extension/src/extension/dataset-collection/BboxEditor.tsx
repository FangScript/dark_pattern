import {
  DeleteOutlined,
  PlusOutlined,
  SaveOutlined,
  UndoOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import { Button, Modal, Select, Space, Tag, Tooltip, message } from 'antd';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type BboxAnnotation, SEVERITY_COLORS } from '../../utils/bboxOverlay';
import type { DarkPattern } from '../../utils/datasetDB';
import './BboxEditor.less';

const PATTERN_TYPES = [
  'Nagging',
  'Dead End/Roach Motel',
  'Price Comparison Prevention',
  'Disguised Ad / Bait & Switch',
  'Reference Pricing',
  'False Hierarchy',
  'Bundling / Auto-add / Bad Defaults',
  'Pressured Selling / FOMO / Urgency',
  'Scarcity & Popularity',
  'Hard To Close',
  'Trick Questions / Confirmshaming',
  'Hidden Information',
  'Infinite Scrolling',
  'Forced Ads / Autoplay',
];

const SEVERITY_OPTIONS = ['low', 'medium', 'high', 'critical'];

interface BboxEditorProps {
  screenshot: string;
  patterns: DarkPattern[];
  onSave: (patterns: DarkPattern[]) => void;
  onCancel: () => void;
}

interface EditableBox {
  id: string;
  bbox: [number, number, number, number];
  label: string;
  severity: string;
  description: string;
  evidence: string;
  isNew?: boolean;
}

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | null;

export default function BboxEditor({
  screenshot,
  patterns,
  onSave,
  onCancel,
}: BboxEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [boxes, setBoxes] = useState<EditableBox[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [history, setHistory] = useState<EditableBox[][]>([]);

  // Initialize boxes from patterns
  useEffect(() => {
    if (!patterns) {
      setBoxes([]);
      setHistory([[]]);
      return;
    }
    const initialBoxes: EditableBox[] = patterns.map((p, idx) => ({
      id: `box-${Date.now()}-${idx}`,
      bbox: p.bbox && p.bbox.length === 4 ? p.bbox : [0, 0, 100, 100],
      label: p.type || 'Unknown',
      severity: p.severity || 'medium',
      description: p.description || '',
      evidence: p.evidence || '',
    }));
    setBoxes(initialBoxes);
    setHistory([initialBoxes]);
  }, [patterns]);

  // Load image and set up canvas
  useEffect(() => {
    if (!screenshot) return;

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      // Short delay to ensure canvas is ready
      requestAnimationFrame(() => redrawCanvas());
    };
    img.onerror = () => {
      console.error('Failed to load screenshot');
      message.error('Failed to load screenshot image');
    };
    img.src = screenshot;
  }, [screenshot]);

  // Redraw canvas when boxes or selection changes
  useEffect(() => {
    redrawCanvas();
  }, [boxes, selectedBoxId, scale]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Safety clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    canvas.width = img.width * scale;
    canvas.height = img.height * scale;

    // Draw image
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Draw all bboxes
    boxes.forEach((box) => {
      if (!box || !box.bbox || box.bbox.length !== 4) return;

      const [x, y, w, h] = box.bbox.map((v) => v * scale);
      const style = SEVERITY_COLORS[box.severity] || SEVERITY_COLORS.medium;
      const isSelected = box.id === selectedBoxId;

      // Fill
      ctx.fillStyle = style.fillColor;
      ctx.fillRect(x, y, w, h);

      // Border
      ctx.strokeStyle = isSelected ? '#0066ff' : style.strokeColor;
      ctx.lineWidth = isSelected ? 4 : style.strokeWidth;
      ctx.setLineDash(isSelected ? [5, 5] : []);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);

      // Label
      const labelText = box.label || 'Unknown';
      ctx.font = `bold ${12 * scale}px Arial`;
      const metrics = ctx.measureText(labelText);
      const labelH = 16 * scale;
      const labelW = metrics.width + 8 * scale;

      ctx.fillStyle = style.labelBgColor;
      ctx.fillRect(x, y - labelH, labelW, labelH);

      ctx.fillStyle = style.labelTextColor;
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, x + 4 * scale, y - labelH / 2);

      // Draw resize handles if selected
      if (isSelected) {
        const handleSize = 8;
        ctx.fillStyle = '#0066ff';
        const handles = [
          [x, y],
          [x + w / 2, y],
          [x + w, y],
          [x + w, y + h / 2],
          [x + w, y + h],
          [x + w / 2, y + h],
          [x, y + h],
          [x, y + h / 2],
        ];
        handles.forEach(([hx, hy]) => {
          ctx.fillRect(
            hx - handleSize / 2,
            hy - handleSize / 2,
            handleSize,
            handleSize,
          );
        });
      }
    });
  }, [boxes, selectedBoxId, scale]);

  const getMousePos = (e: React.MouseEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  };

  const findBoxAtPoint = (x: number, y: number): EditableBox | null => {
    // Search in reverse order (top-most first)
    for (let i = boxes.length - 1; i >= 0; i--) {
      const box = boxes[i];
      const [bx, by, bw, bh] = box.bbox;
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
        return box;
      }
    }
    return null;
  };

  const getResizeHandle = (
    x: number,
    y: number,
    box: EditableBox,
  ): ResizeHandle => {
    const [bx, by, bw, bh] = box.bbox;
    const threshold = 10 / scale;

    const nearLeft = Math.abs(x - bx) < threshold;
    const nearRight = Math.abs(x - (bx + bw)) < threshold;
    const nearTop = Math.abs(y - by) < threshold;
    const nearBottom = Math.abs(y - (by + bh)) < threshold;

    if (nearTop && nearLeft) return 'nw';
    if (nearTop && nearRight) return 'ne';
    if (nearBottom && nearLeft) return 'sw';
    if (nearBottom && nearRight) return 'se';
    if (nearTop) return 'n';
    if (nearBottom) return 's';
    if (nearLeft) return 'w';
    if (nearRight) return 'e';
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getMousePos(e);
    const clickedBox = findBoxAtPoint(pos.x, pos.y);

    if (clickedBox) {
      setSelectedBoxId(clickedBox.id);
      const handle = getResizeHandle(pos.x, pos.y, clickedBox);

      if (handle) {
        setIsResizing(true);
        setResizeHandle(handle);
      } else {
        setIsDragging(true);
        setDragOffset({
          x: pos.x - clickedBox.bbox[0],
          y: pos.y - clickedBox.bbox[1],
        });
      }
    } else {
      // Start drawing new box
      setSelectedBoxId(null);
      setIsDrawing(true);
      setDrawStart(pos);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getMousePos(e);

    if (isDrawing && drawStart) {
      // Preview new box
      const canvas = canvasRef.current;
      if (canvas) {
        redrawCanvas();
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.strokeStyle = '#0066ff';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          const x = Math.min(drawStart.x, pos.x) * scale;
          const y = Math.min(drawStart.y, pos.y) * scale;
          const w = Math.abs(pos.x - drawStart.x) * scale;
          const h = Math.abs(pos.y - drawStart.y) * scale;
          ctx.strokeRect(x, y, w, h);
        }
      }
      return;
    }

    if (isDragging && selectedBoxId) {
      setBoxes((prev) =>
        prev.map((box) => {
          if (box.id === selectedBoxId) {
            return {
              ...box,
              bbox: [
                Math.max(0, pos.x - dragOffset.x),
                Math.max(0, pos.y - dragOffset.y),
                box.bbox[2],
                box.bbox[3],
              ] as [number, number, number, number],
            };
          }
          return box;
        }),
      );
      return;
    }

    if (isResizing && selectedBoxId && resizeHandle) {
      setBoxes((prev) =>
        prev.map((box) => {
          if (box.id !== selectedBoxId) return box;
          const [x, y, w, h] = box.bbox;
          let newX = x;
          let newY = y;
          let newW = w;
          let newH = h;

          switch (resizeHandle) {
            case 'nw':
              newX = pos.x;
              newY = pos.y;
              newW = x + w - pos.x;
              newH = y + h - pos.y;
              break;
            case 'ne':
              newY = pos.y;
              newW = pos.x - x;
              newH = y + h - pos.y;
              break;
            case 'sw':
              newX = pos.x;
              newW = x + w - pos.x;
              newH = pos.y - y;
              break;
            case 'se':
              newW = pos.x - x;
              newH = pos.y - y;
              break;
            case 'n':
              newY = pos.y;
              newH = y + h - pos.y;
              break;
            case 's':
              newH = pos.y - y;
              break;
            case 'w':
              newX = pos.x;
              newW = x + w - pos.x;
              break;
            case 'e':
              newW = pos.x - x;
              break;
          }

          return {
            ...box,
            bbox: [
              Math.max(0, newX),
              Math.max(0, newY),
              Math.max(10, newW),
              Math.max(10, newH),
            ] as [number, number, number, number],
          };
        }),
      );
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isDrawing && drawStart) {
      const pos = getMousePos(e);
      const x = Math.min(drawStart.x, pos.x);
      const y = Math.min(drawStart.y, pos.y);
      const w = Math.abs(pos.x - drawStart.x);
      const h = Math.abs(pos.y - drawStart.y);

      if (w > 10 && h > 10) {
        const newBox: EditableBox = {
          id: `box-${Date.now()}`,
          bbox: [Math.round(x), Math.round(y), Math.round(w), Math.round(h)],
          label: 'Select Pattern Type',
          severity: 'medium',
          description: '',
          evidence: '',
          isNew: true,
        };
        setBoxes((prev) => [...prev, newBox]);
        setSelectedBoxId(newBox.id);
        saveHistory();
      }
    }

    if (isDragging || isResizing) {
      saveHistory();
    }

    setIsDrawing(false);
    setDrawStart(null);
    setIsDragging(false);
    setIsResizing(false);
    setResizeHandle(null);
  };

  const saveHistory = () => {
    setHistory((prev) => [...prev.slice(-20), boxes]);
  };

  const handleUndo = () => {
    if (history.length > 1) {
      const prevState = history[history.length - 2];
      setHistory((prev) => prev.slice(0, -1));
      setBoxes(prevState);
    }
  };

  const handleDeleteSelected = () => {
    if (selectedBoxId) {
      saveHistory();
      setBoxes((prev) => prev.filter((b) => b.id !== selectedBoxId));
      setSelectedBoxId(null);
    }
  };

  const handleSave = () => {
    const updatedPatterns: DarkPattern[] = boxes.map((box) => ({
      type: box.label,
      description: box.description || `${box.label} detected`,
      severity: box.severity as DarkPattern['severity'],
      location: 'User annotated',
      evidence: box.evidence || 'Manually annotated bounding box',
      confidence: 1.0,
      bbox: box.bbox.map(Math.round) as [number, number, number, number],
    }));
    onSave(updatedPatterns);
  };

  const selectedBox = boxes.find((b) => b.id === selectedBoxId);

  return (
    <div className="bbox-editor">
      <div className="bbox-editor-toolbar">
        <Space>
          <Tooltip title="Add new box: Click and drag on image">
            <Button icon={<PlusOutlined />}>Draw Box</Button>
          </Tooltip>
          <Button
            icon={<DeleteOutlined />}
            disabled={!selectedBoxId}
            onClick={handleDeleteSelected}
            danger
          >
            Delete
          </Button>
          <Button
            icon={<UndoOutlined />}
            onClick={handleUndo}
            disabled={history.length <= 1}
          >
            Undo
          </Button>
          <Button
            icon={<ZoomInOutlined />}
            onClick={() => setScale((s) => Math.min(2, s + 0.1))}
          >
            Zoom In
          </Button>
          <Button
            icon={<ZoomOutOutlined />}
            onClick={() => setScale((s) => Math.max(0.3, s - 0.1))}
          >
            Zoom Out
          </Button>
          <span style={{ marginLeft: 16 }}>
            Scale: {Math.round(scale * 100)}%
          </span>
        </Space>
        <Space>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>
            Save Changes
          </Button>
        </Space>
      </div>

      {selectedBox && (
        <div className="bbox-editor-properties">
          <Space wrap>
            <span>Pattern Type:</span>
            <Select
              style={{ width: 250 }}
              value={selectedBox.label}
              onChange={(value) =>
                setBoxes((prev) =>
                  prev.map((b) =>
                    b.id === selectedBoxId ? { ...b, label: value } : b,
                  ),
                )
              }
            >
              {PATTERN_TYPES.map((type) => (
                <Select.Option key={type} value={type}>
                  {type}
                </Select.Option>
              ))}
            </Select>
            <span>Severity:</span>
            <Select
              style={{ width: 100 }}
              value={selectedBox.severity}
              onChange={(value) =>
                setBoxes((prev) =>
                  prev.map((b) =>
                    b.id === selectedBoxId ? { ...b, severity: value } : b,
                  ),
                )
              }
            >
              {SEVERITY_OPTIONS.map((sev) => (
                <Select.Option key={sev} value={sev}>
                  <Tag color={SEVERITY_COLORS[sev]?.strokeColor}>{sev}</Tag>
                </Select.Option>
              ))}
            </Select>
            <span>
              Bbox: [{selectedBox.bbox.map((v) => Math.round(v)).join(', ')}]
            </span>
          </Space>
        </div>
      )}

      <div className="bbox-editor-legend">
        <Space>
          <span>Severity:</span>
          {Object.entries(SEVERITY_COLORS).map(([key, style]) => (
            <Tag key={key} color={style.strokeColor}>
              {key}
            </Tag>
          ))}
        </Space>
      </div>

      <div className="bbox-editor-canvas-container" ref={containerRef}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            setIsDrawing(false);
            setIsDragging(false);
            setIsResizing(false);
          }}
          style={{
            cursor: isDrawing ? 'crosshair' : isDragging ? 'move' : 'default',
          }}
        />
      </div>

      <div className="bbox-editor-box-list">
        <h4>Annotations ({boxes.length})</h4>
        {boxes.map((box, idx) => (
          <div
            key={box.id}
            className={`bbox-list-item ${box.id === selectedBoxId ? 'selected' : ''}`}
            onClick={() => setSelectedBoxId(box.id)}
          >
            <Tag color={SEVERITY_COLORS[box.severity]?.strokeColor}>
              {idx + 1}
            </Tag>
            <span>{box.label}</span>
            {box.isNew && <Tag color="blue">New</Tag>}
          </div>
        ))}
      </div>
    </div>
  );
}
