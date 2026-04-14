import {
  ArrowRightOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  LogoutOutlined,
  MinusOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Alert } from 'antd';
import type React from 'react';
import ShinyText from '../shiny-text';

export function timeCostStrElement(timeCost?: number) {
  let str: string;
  if (typeof timeCost !== 'number') {
    str = '-';
  } else {
    str = `${(timeCost / 1000).toFixed(2)}s`;
  }
  return (
    <span
      style={{
        fontVariantNumeric: 'tabular-nums',
        fontFeatureSettings: 'tnum',
      }}
    >
      {str}
    </span>
  );
}

export const iconForStatus = (status: string) => {
  switch (status) {
    case 'finished':
    case 'passed':
    case 'success':
    case 'connected':
      return (
        <span style={{ color: '#00AD4B' }}>
          <CheckOutlined />
        </span>
      );

    case 'finishedWithWarning':
      return (
        <span style={{ color: '#f7bb05' }}>
          <WarningOutlined />
        </span>
      );
    case 'failed':
    case 'closed':
    case 'timedOut':
    case 'interrupted':
      return (
        <span style={{ color: '#FF0A0A' }}>
          <CloseOutlined />
        </span>
      );
    case 'pending':
      return <ClockCircleOutlined />;
    case 'cancelled':
    case 'skipped':
      return <LogoutOutlined />;
    case 'running':
      return <ArrowRightOutlined />;
    default:
      return <MinusOutlined />;
  }
};

// server not ready error message (Server mode expects a reachable HTTP automation backend)
export const errorMessageServerNotReady = (
  <span>
    The automation server did not respond. If you use Server mode, start your
    Node process that hosts the agent HTTP API, or switch to In-Browser /
    In-Browser-Extension mode.
  </span>
);

// server launch tip
export const serverLaunchTip = (
  notReadyMessage: React.ReactNode | string = errorMessageServerNotReady,
) => (
  <div className="server-tip">
    <Alert
      message="Automation server not ready"
      description={notReadyMessage}
      type="warning"
    />
  </div>
);

// empty result tip
export const emptyResultTip = (
  <div className="result-empty-tip" style={{ textAlign: 'center' }}>
    <ShinyText disabled text="The result will be shown here" />
  </div>
);
