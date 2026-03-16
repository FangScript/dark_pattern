/**
 * Human Review Panel for Label Verification
 *
 * Allows reviewers to:
 * - View auto-generated labels with full details
 * - View cropped evidence image from screenshot
 * - See location, description, and countermeasures
 * - Accept/reject labels
 * - Edit bounding boxes
 * - Add new labels manually
 * - Save verified labels
 */

import {
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
  PlusOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  Divider,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { useState, useEffect } from 'react';
import type { AutoLabel, DatasetEntry, VerifiedLabel } from '../../utils/datasetDB';
import BboxEditor from './BboxEditor';
import './LabelReviewPanel.less';

const { Text, Title, Paragraph } = Typography;

// 18-category taxonomy
const PATTERN_CATEGORIES = [
  'Nagging',
  'Scarcity & Popularity',
  'FOMO / Urgency',
  'Reference Pricing',
  'Disguised Ads',
  'False Hierarchy',
  'Interface Interference',
  'Misdirection',
  'Hard To Close',
  'Obstruction',
  'Bundling',
  'Sneaking',
  'Hidden Information',
  'Subscription Trap',
  'Roach Motel',
  'Confirmshaming',
  'Forced Registration',
  'Gamification Pressure',
] as const;

// Countermeasures for each dark pattern category
const COUNTERMEASURES: Record<string, string> = {
  'Nagging': 'Use browser extensions to block repetitive popups. Close or dismiss the prompt — you are not obligated to act on repeated requests.',
  'Scarcity & Popularity': 'Verify scarcity claims independently. Low stock indicators are frequently fabricated. Check back later to see if the item restocks.',
  'FOMO / Urgency': 'Ignore countdown timers — they often reset on refresh. Take your time to research before purchasing.',
  'Reference Pricing': 'Research the actual market price on multiple platforms before assuming the crossed-out price is genuine.',
  'Disguised Ads': 'Look for Sponsored, Ad, or Promoted labels. Ad-blockers can remove many disguised ads automatically.',
  'False Hierarchy': 'Read all button options carefully. The less prominent button (small, gray) may be the better choice for you.',
  'Interface Interference': 'Look for all available options before clicking the default highlighted button — it may not be in your best interest.',
  'Misdirection': 'Slow down and read the full context before clicking. Visual accents may draw your eye away from important information.',
  'Hard To Close': 'Look for the full browser close button (Alt+F4, ⌘W) or navigate away if dismiss buttons are hidden.',
  'Obstruction': 'Search for the direct path (e.g., account deletion URL) rather than following the in-app flow.',
  'Bundling': 'Always review the order summary before confirming a purchase to find pre-checked add-ons.',
  'Sneaking': 'Review your cart and checkout summary carefully for items you didn\'t actively add.',
  'Hidden Information': 'Always expand all pricing sections and fee breakdowns before checkout.',
  'Subscription Trap': 'Read all terms before free trial sign-ups. Set a calendar reminder to cancel before billing begins.',
  'Roach Motel': 'Look for account deletion via the app\'s settings, or contact support directly. Check for a browser-based account portal.',
  'Confirmshaming': 'Recognize that "No thanks, I don\'t want to save money" is a manipulation tactic — decline confidently.',
  'Forced Registration': 'Look for a Guest Checkout option. Use a temporary email service if registration is truly required.',
  'Gamification Pressure': 'Streaks, coins, and progress bars are artificial scarcity — ignore the pressure and act on your own terms.',
};

/**
 * Crop a region from a base64 screenshot using bbox [x, y, w, h].
 * Returns a new base64 data URL of the cropped region, or null if failed.
 */
async function cropEvidence(
  screenshot: string,
  bbox: [number, number, number, number],
): Promise<string | null> {
  if (!screenshot || !bbox || bbox.length !== 4) return null;
  const [x, y, w, h] = bbox;
  if (w <= 0 || h <= 0) return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }

      // Draw full image
      ctx.drawImage(img, 0, 0);

      // Draw a highlight rect for the actual bbox
      ctx.strokeStyle = '#ff4d4f';
      ctx.lineWidth = 5;
      ctx.strokeRect(x, y, w, h);

      // Add a slight red tint inside the box for better visibility
      ctx.fillStyle = 'rgba(255, 77, 79, 0.2)';
      ctx.fillRect(x, y, w, h);

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = screenshot;
  });
}

interface LabelReviewPanelProps {
  entry: DatasetEntry;
  onSave: (verifiedLabels: VerifiedLabel[]) => void;
  onCancel: () => void;
}

interface ReviewItem {
  id: string;
  autoLabel: AutoLabel;
  verified: boolean | null;
  editedBbox?: [number, number, number, number];
  editedCategory?: string;
  editedLocation?: string;
  editedDescription?: string;
  editedEvidence?: string;
  notes?: string;
}

/** Evidence image subcomponent — crops and displays the screenshot region. */
function EvidenceImage({
  screenshot,
  bbox,
}: {
  screenshot: string | undefined;
  bbox: [number, number, number, number];
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!screenshot) { setLoading(false); return; }
    cropEvidence(screenshot, bbox).then((result) => {
      setSrc(result);
      setLoading(false);
    });
  }, [screenshot, bbox?.join(',')]);

  if (loading) {
    return <Text type="secondary" style={{ fontSize: '12px' }}>Loading evidence image...</Text>;
  }
  if (!src) {
    return <Text type="secondary" style={{ fontSize: '12px' }}>No screenshot available for this pattern.</Text>;
  }
  return (
    <img
      src={src}
      alt="Evidence"
      style={{
        width: '100%',
        maxHeight: 220,
        objectFit: 'contain',
        borderRadius: 6,
        border: '1px solid #f0f0f0',
        background: '#fafafa',
      }}
    />
  );
}

export default function LabelReviewPanel({
  entry,
  onSave,
  onCancel,
}: LabelReviewPanelProps) {
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>(() => {
    // If the entry has verified_labels, use those to initialize the edit state
    if (entry.verified_labels && entry.verified_labels.length > 0) {
      return entry.verified_labels.map((verifiedLabel, idx) => ({
        id: `review-verified-${idx}`,
        // Reconstruct a pseudo-autoLabel for the UI to display the base fields
        autoLabel: {
          category: verifiedLabel.category,
          bbox: verifiedLabel.bbox,
          confidence: 1.0, // verified labels are 100% confident
          model: 'human-verified',
          severity: 'medium', // Fallback severity
          location: verifiedLabel.location,
          description: verifiedLabel.description,
          evidence: verifiedLabel.evidence,
          viewportIndex: verifiedLabel.viewportIndex,
        },
        verified: verifiedLabel.verified,
        editedBbox: verifiedLabel.bbox,
        editedCategory: verifiedLabel.category,
        editedLocation: verifiedLabel.location,
        editedDescription: verifiedLabel.description,
        editedEvidence: verifiedLabel.evidence,
        notes: verifiedLabel.notes,
      }));
    }

    // Otherwise, fallback to raw auto_labels
    return (entry.auto_labels || []).map((autoLabel, idx) => ({
      id: `review-${idx}`,
      autoLabel,
      verified: null,
      editedBbox: undefined,
    }));
  });

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [showBboxEditor, setShowBboxEditor] = useState(false);

  const handleAccept = (itemId: string) => {
    setReviewItems((items) =>
      items.map((item) =>
        item.id === itemId ? { ...item, verified: true } : item
      )
    );
  };

  const handleReject = (itemId: string) => {
    setReviewItems((items) =>
      items.map((item) =>
        item.id === itemId ? { ...item, verified: false } : item
      )
    );
  };

  const handleEditBbox = (itemId: string) => {
    setEditingItemId(itemId);
    setShowBboxEditor(true);
  };

  const handleBboxSave = (bbox: [number, number, number, number]) => {
    if (editingItemId) {
      setReviewItems((items) =>
        items.map((item) =>
          item.id === editingItemId
            ? { ...item, editedBbox: bbox }
            : item
        )
      );
      setEditingItemId(null);
      setShowBboxEditor(false);
      message.success('Bounding box updated');
    }
  };

  const handleCategoryChange = (itemId: string, category: string) => {
    setReviewItems((items) =>
      items.map((item) =>
        item.id === itemId ? { ...item, editedCategory: category } : item
      )
    );
  };

  const handleFieldChange = (
    itemId: string,
    field: 'editedLocation' | 'editedDescription' | 'editedEvidence',
    value: string,
  ) => {
    setReviewItems((items) =>
      items.map((item) =>
        item.id === itemId ? { ...item, [field]: value } : item
      )
    );
  };

  const handleAddManualLabel = () => {
    const newItem: ReviewItem = {
      id: `manual-${Date.now()}`,
      autoLabel: {
        category: PATTERN_CATEGORIES[0],
        bbox: [100, 100, 200, 50],
        confidence: 1.0,
        model: 'manual',
        severity: 'medium',
        location: '',
        description: '',
        evidence: '',
        viewportIndex: 0,
      },
      verified: null,
    };
    setReviewItems([...reviewItems, newItem]);
    setEditingItemId(newItem.id);
    setShowBboxEditor(true);
  };

  const handleSave = () => {
    const verifiedLabels: VerifiedLabel[] = reviewItems
      .filter((item) => item.verified === true)
      .map((item) => ({
        category: item.editedCategory || item.autoLabel.category,
        bbox: item.editedBbox || item.autoLabel.bbox,
        verified: true,
        reviewTimestamp: Date.now(),
        notes: item.notes,
        viewportIndex: item.autoLabel.viewportIndex ?? 0,
        location: item.editedLocation ?? item.autoLabel.location,
        description: item.editedDescription ?? item.autoLabel.description,
        evidence: item.editedEvidence ?? item.autoLabel.evidence,
      }));

    if (verifiedLabels.length === 0) {
      Modal.warning({
        title: 'No Labels Verified',
        content: 'Please accept at least one label before saving.',
      });
      return;
    }

    onSave(verifiedLabels);
  };

  const pendingCount = reviewItems.filter((item) => item.verified === null).length;
  const acceptedCount = reviewItems.filter((item) => item.verified === true).length;
  const rejectedCount = reviewItems.filter((item) => item.verified === false).length;

  const editingItem = editingItemId
    ? reviewItems.find((item) => item.id === editingItemId)
    : null;

  const getScreenshotForViewport = (viewportIndex?: number): string | undefined => {
    if (viewportIndex !== undefined && entry.viewport_screenshots) {
      const vs = entry.viewport_screenshots[viewportIndex];
      if (vs?.screenshot) return vs.screenshot;
    }
    return entry.screenshot;
  };

  const getSeverityColor = (severity?: string) => {
    const map: Record<string, string> = {
      critical: 'red', high: 'orange', medium: 'gold', low: 'green',
    };
    return map[severity || 'medium'] || 'blue';
  };

  return (
    <div className="label-review-panel">
      <Card
        title={
          <div>
            <Title level={4} style={{ margin: 0 }}>
              Manual Label Review
            </Title>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {entry.url}
            </Text>
          </div>
        }
        extra={
          <Space>
            <Tag color="blue">Pending: {pendingCount}</Tag>
            <Tag color="green">Accepted: {acceptedCount}</Tag>
            <Tag color="red">Rejected: {rejectedCount}</Tag>
          </Space>
        }
        style={{ width: '100%', maxHeight: '90vh', overflow: 'auto' }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* Instructions */}
          <Card size="small" type="inner">
            <Text>
              Review each auto-generated label below. For manual additions, click{' '}
              <strong>+ Add Manual Label</strong>, then draw a bounding box on the screenshot.
            </Text>
          </Card>

          {/* Label List */}
          <div className="review-items-list">
            {reviewItems.length === 0 ? (
              <Card>
                <Text type="secondary">
                  No auto-labels found. Click <strong>+ Add Manual Label</strong> to add annotations from scratch.
                </Text>
              </Card>
            ) : (
              reviewItems.map((item) => {
                const category = item.editedCategory || item.autoLabel.category;
                const bbox = item.editedBbox || item.autoLabel.bbox;
                const screenshot = getScreenshotForViewport(item.autoLabel.viewportIndex);
                const countermeasure = COUNTERMEASURES[category] || 'No countermeasure info available for this pattern.';

                return (
                  <Card
                    key={item.id}
                    size="small"
                    style={{
                      marginBottom: 12,
                      border:
                        item.verified === true
                          ? '2px solid #52c41a'
                          : item.verified === false
                            ? '2px solid #ff4d4f'
                            : '1px solid #d9d9d9',
                    }}
                  >
                    {/* Header row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <Space wrap>
                        <Tag color={getSeverityColor(item.autoLabel.severity)}>
                          {(item.autoLabel.severity || 'medium').toUpperCase()}
                        </Tag>
                        <Select
                          value={category}
                          size="small"
                          style={{ minWidth: 200 }}
                          onChange={(val) => handleCategoryChange(item.id, val)}
                          options={PATTERN_CATEGORIES.map((c) => ({ value: c, label: c }))}
                        />
                        {item.autoLabel.model !== 'manual' && (
                          <Text type="secondary" style={{ fontSize: '11px' }}>
                            Model: {item.autoLabel.model} | Conf: {(item.autoLabel.confidence * 100).toFixed(0)}%
                          </Text>
                        )}
                        {item.autoLabel.viewportIndex !== undefined && (
                          <Tag>Viewport {item.autoLabel.viewportIndex + 1}</Tag>
                        )}
                        {item.editedBbox && <Tag color="orange">Bbox edited</Tag>}
                      </Space>

                      <Space>
                        {item.verified === null && (
                          <>
                            <Button
                              type="primary"
                              icon={<CheckOutlined />}
                              size="small"
                              onClick={() => handleAccept(item.id)}
                            >
                              Accept
                            </Button>
                            <Button
                              danger
                              icon={<CloseOutlined />}
                              size="small"
                              onClick={() => handleReject(item.id)}
                            >
                              Reject
                            </Button>
                            <Button
                              icon={<EditOutlined />}
                              size="small"
                              onClick={() => handleEditBbox(item.id)}
                            >
                              Edit Box
                            </Button>
                          </>
                        )}
                        {item.verified === true && (
                          <Space>
                            <Tag color="success">✓ Accepted</Tag>
                            <Button size="small" icon={<EditOutlined />} onClick={() => handleEditBbox(item.id)}>
                              Edit Box
                            </Button>
                          </Space>
                        )}
                        {item.verified === false && (
                          <Tag color="error">✗ Rejected</Tag>
                        )}
                      </Space>
                    </div>

                    <Divider style={{ margin: '8px 0' }} />

                    <Row gutter={16}>
                      {/* Left column: details */}
                      <Col span={12}>
                        <Space direction="vertical" style={{ width: '100%' }} size="small">

                          {/* Location */}
                          <div>
                            <Text strong style={{ fontSize: '12px' }}>📍 Location:</Text>
                            <Input
                              style={{ marginTop: 4 }}
                              size="small"
                              placeholder="e.g. product card, checkout header..."
                              value={item.editedLocation ?? (item.autoLabel.location || '')}
                              onChange={(e) => handleFieldChange(item.id, 'editedLocation', e.target.value)}
                            />
                          </div>

                          {/* Description */}
                          <div>
                            <Text strong style={{ fontSize: '12px' }}>📝 Description:</Text>
                            <Input.TextArea
                              style={{ marginTop: 4 }}
                              size="small"
                              rows={3}
                              placeholder="Describe why this is a dark pattern..."
                              value={item.editedDescription ?? (item.autoLabel.description || '')}
                              onChange={(e) => handleFieldChange(item.id, 'editedDescription', e.target.value)}
                            />
                          </div>

                          {/* Bounding Box */}
                          {bbox && bbox.length === 4 && (
                            <div>
                              <Text strong style={{ fontSize: '12px' }}>📐 Bounding Box:</Text>
                              <br />
                              <Text code style={{ fontSize: '11px' }}>
                                x:{bbox[0]} y:{bbox[1]} w:{bbox[2]} h:{bbox[3]}
                              </Text>
                            </div>
                          )}

                          {/* Countermeasures */}
                          <div style={{
                            background: '#f6ffed',
                            border: '1px solid #b7eb8f',
                            borderRadius: 6,
                            padding: '8px 10px',
                            marginTop: 4,
                          }}>
                            <Text strong style={{ fontSize: '12px', color: '#389e0d' }}>
                              🛡️ Countermeasure:
                            </Text>
                            <br />
                            <Text style={{ fontSize: '11px' }}>{countermeasure}</Text>
                          </div>
                        </Space>
                      </Col>

                      {/* Right column: evidence */}
                      <Col span={12}>
                        <Text strong style={{ fontSize: '12px', display: 'block', marginBottom: 4 }}>
                          🔍 Evidence (text):
                        </Text>
                        <Input.TextArea
                          rows={2}
                          size="small"
                          style={{ marginBottom: 8 }}
                          placeholder="Exact text or element that proves this pattern..."
                          value={item.editedEvidence ?? (item.autoLabel.evidence || '')}
                          onChange={(e) => handleFieldChange(item.id, 'editedEvidence', e.target.value)}
                        />
                        <Text strong style={{ fontSize: '12px', display: 'block', marginBottom: 4 }}>
                          🖼️ Evidence (Cropped Screenshot):
                        </Text>
                        <EvidenceImage
                          screenshot={screenshot}
                          bbox={bbox || [0, 0, 0, 0]}
                        />
                      </Col>
                    </Row>
                  </Card>
                );
              })
            )}
          </div>

          {/* Actions */}
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Button icon={<PlusOutlined />} onClick={handleAddManualLabel} type="dashed">
              + Add Manual Label
            </Button>
            <Space>
              <Button onClick={onCancel}>Cancel</Button>
              <Button type="primary" onClick={handleSave}>
                Save Verified Labels ({acceptedCount})
              </Button>
            </Space>
          </Space>
        </Space>
      </Card>

      {/* Bbox Editor Modal */}
      {showBboxEditor && editingItem && (
        <Modal
          title="Edit Bounding Box"
          open={showBboxEditor}
          onCancel={() => {
            setShowBboxEditor(false);
            setEditingItemId(null);
          }}
          footer={null}
          width="90%"
          style={{ top: 20 }}
        >
          <BboxEditor
            screenshot={getScreenshotForViewport(editingItem.autoLabel.viewportIndex) || ''}
            patterns={[
              {
                type: editingItem.editedCategory || editingItem.autoLabel.category,
                bbox: editingItem.editedBbox || editingItem.autoLabel.bbox,
                description: editingItem.autoLabel.description || '',
                severity: editingItem.autoLabel.severity || 'medium',
                location: editingItem.autoLabel.location || '',
                evidence: editingItem.autoLabel.evidence || '',
                confidence: editingItem.autoLabel.confidence,
                viewportIndex: editingItem.autoLabel.viewportIndex,
              },
            ]}
            onSave={(patterns) => {
              if (patterns[0]?.bbox) {
                handleBboxSave(patterns[0].bbox);
              }
            }}
            onCancel={() => {
              setShowBboxEditor(false);
              setEditingItemId(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
