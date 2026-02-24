/**
 * Human Review Panel for Label Verification
 * 
 * Allows reviewers to:
 * - View auto-generated labels
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
} from '@ant-design/icons';
import {
  Button,
  Card,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { useState } from 'react';
import type { AutoLabel, DatasetEntry, VerifiedLabel } from '../../utils/datasetDB';
import BboxEditor from './BboxEditor';
import './LabelReviewPanel.less';

const { Text, Title } = Typography;

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

interface LabelReviewPanelProps {
  entry: DatasetEntry;
  onSave: (verifiedLabels: VerifiedLabel[]) => void;
  onCancel: () => void;
}

interface ReviewItem {
  id: string;
  autoLabel: AutoLabel;
  verified: boolean | null; // null = pending, true = accepted, false = rejected
  editedBbox?: [number, number, number, number];
  notes?: string;
}

export default function LabelReviewPanel({
  entry,
  onSave,
  onCancel,
}: LabelReviewPanelProps) {
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>(() => {
    // Initialize from auto_labels
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

  const handleAddManualLabel = () => {
    const newItem: ReviewItem = {
      id: `manual-${Date.now()}`,
      autoLabel: {
        category: PATTERN_CATEGORIES[0],
        bbox: [100, 100, 200, 50],
        confidence: 1.0,
        model: 'manual',
        viewportIndex: 0,
      },
      verified: null,
    };
    setReviewItems([...reviewItems, newItem]);
    setEditingItemId(newItem.id);
    setShowBboxEditor(true);
  };

  const handleSave = () => {
    // Convert review items to verified labels
    const verifiedLabels: VerifiedLabel[] = reviewItems
      .filter((item) => item.verified === true)
      .map((item) => ({
        category: item.autoLabel.category,
        bbox: item.editedBbox || item.autoLabel.bbox,
        verified: true,
        reviewTimestamp: Date.now(),
        notes: item.notes,
        viewportIndex: item.autoLabel.viewportIndex,
      }));

    if (verifiedLabels.length === 0) {
      Modal.warning({
        title: 'No Labels Verified',
        content: 'Please accept at least one label before saving.',
      });
      return;
    }

    onSave(verifiedLabels);
    message.success(`Saved ${verifiedLabels.length} verified label(s)`);
  };

  const pendingCount = reviewItems.filter((item) => item.verified === null).length;
  const acceptedCount = reviewItems.filter((item) => item.verified === true).length;
  const rejectedCount = reviewItems.filter((item) => item.verified === false).length;

  const editingItem = editingItemId
    ? reviewItems.find((item) => item.id === editingItemId)
    : null;

  const getScreenshotForEditing = () => {
    if (editingItem && editingItem.autoLabel.viewportIndex !== undefined && entry.viewport_screenshots) {
      const vs = entry.viewport_screenshots[editingItem.autoLabel.viewportIndex];
      if (vs && vs.screenshot) return vs.screenshot;
    }
    return entry.screenshot;
  };

  return (
    <div className="label-review-panel">
      <Card
        title={
          <div>
            <Title level={4} style={{ margin: 0 }}>
              Review Auto-Generated Labels
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
              Review each auto-generated label below. Click{' '}
              <CheckOutlined style={{ color: '#52c41a' }} /> to accept,{' '}
              <CloseOutlined style={{ color: '#ff4d4f' }} /> to reject, or{' '}
              <EditOutlined /> to edit the bounding box.
            </Text>
          </Card>

          {/* Label List */}
          <div className="review-items-list">
            {reviewItems.length === 0 ? (
              <Card>
                <Text type="secondary">No auto-labels to review.</Text>
              </Card>
            ) : (
              reviewItems.map((item) => (
                <Card
                  key={item.id}
                  size="small"
                  style={{
                    marginBottom: 8,
                    border:
                      item.verified === true
                        ? '2px solid #52c41a'
                        : item.verified === false
                          ? '2px solid #ff4d4f'
                          : '1px solid #d9d9d9',
                  }}
                >
                  <Space direction="vertical" style={{ width: '100%' }} size="small">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Space>
                        <Tag color="blue">{item.autoLabel.category}</Tag>
                        <Text type="secondary">
                          Confidence: {(item.autoLabel.confidence * 100).toFixed(1)}%
                        </Text>
                        <Text type="secondary">Model: {item.autoLabel.model}</Text>
                        {item.autoLabel.viewportIndex !== undefined && (
                          <Tag>Viewport {item.autoLabel.viewportIndex + 1}</Tag>
                        )}
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
                          <Tag color="success">✓ Accepted</Tag>
                        )}
                        {item.verified === false && (
                          <Tag color="error">✗ Rejected</Tag>
                        )}
                      </Space>
                    </div>
                    {item.autoLabel.description && (
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        {item.autoLabel.description}
                      </Text>
                    )}
                    {item.editedBbox && (
                      <Tag color="orange">Bounding box edited</Tag>
                    )}
                  </Space>
                </Card>
              ))
            )}
          </div>

          {/* Actions */}
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Button icon={<PlusOutlined />} onClick={handleAddManualLabel}>
              Add Manual Label
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
      {showBboxEditor && editingItem && getScreenshotForEditing() && (
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
            screenshot={getScreenshotForEditing()!}
            patterns={[
              {
                type: editingItem.autoLabel.category,
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
