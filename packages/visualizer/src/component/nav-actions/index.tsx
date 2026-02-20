import { GithubOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import { EnvConfig } from '../env-config';
import './style.less';

export interface NavActionsProps {
  showEnvConfig?: boolean;
  showTooltipWhenEmpty?: boolean;
  showModelName?: boolean;
  githubUrl?: string;
  className?: string;
}

export function NavActions({
  showEnvConfig = true,
  showTooltipWhenEmpty = false,
  showModelName = false,
  githubUrl = 'https://github.com/darkpatternhunter/dark-pattern-hunter',
  className = '',
}: NavActionsProps) {
  return (
    <div className={`nav-actions ${className}`}>
      <Typography.Link href={githubUrl} target="_blank">
        <GithubOutlined className="nav-icon" />
      </Typography.Link>
      {showEnvConfig && (
        <EnvConfig
          showTooltipWhenEmpty={showTooltipWhenEmpty}
          showModelName={showModelName}
        />
      )}
    </div>
  );
}
