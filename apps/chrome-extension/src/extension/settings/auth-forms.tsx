import {
  FacebookFilled,
  GoogleOutlined,
  LockOutlined,
  MailOutlined,
} from '@ant-design/icons';
import { Button, Checkbox, Input, Space, Typography } from 'antd';

const { Text } = Typography;

type CommonProps = {
  email: string;
  password: string;
  loading: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
};

type LoginFormProps = CommonProps & {
  rememberMe: boolean;
  onRememberMeChange: (checked: boolean) => void;
  onSubmit: () => void;
  onGoogle: () => void;
  onFacebook: () => void;
  onForgotPassword: () => void;
};

type SignUpFormProps = CommonProps & {
  confirmPassword: string;
  onConfirmPasswordChange: (value: string) => void;
  onSubmit: () => void;
  onGoogle: () => void;
  onFacebook: () => void;
};

type AuthSlideFormsProps = {
  mode: 'signin' | 'signup';
  onModeChange: (mode: 'signin' | 'signup') => void;
  login: LoginFormProps;
  signup: SignUpFormProps;
};

function LoginForm(props: LoginFormProps) {
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <div className="auth-headline">
        <div className="auth-title">Login</div>
        <Text type="secondary" className="auth-subtitle">
          Welcome back. Sign in to continue.
        </Text>
      </div>
      <Input
        type="email"
        placeholder="email@example.com"
        prefix={<MailOutlined />}
        value={props.email}
        onChange={(e) => props.onEmailChange(e.target.value)}
        className="auth-input"
      />
      <Input.Password
        placeholder="Password"
        prefix={<LockOutlined />}
        value={props.password}
        onChange={(e) => props.onPasswordChange(e.target.value)}
        className="auth-input"
      />
      <div className="auth-row-between">
        <Checkbox
          checked={props.rememberMe}
          onChange={(e) => props.onRememberMeChange(e.target.checked)}
        >
          Remember me
        </Checkbox>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            props.onForgotPassword();
          }}
          className="auth-link"
        >
          Forgot password?
        </a>
      </div>
      <Button type="primary" onClick={props.onSubmit} loading={props.loading} block>
        Log in
      </Button>
      <div className="auth-divider">
        <span>Or</span>
      </div>
      <div className="auth-social-grid">
        <Button
          onClick={props.onGoogle}
          loading={props.loading}
          className="auth-social-google"
        >
          <GoogleOutlined /> Google
        </Button>
        <Button onClick={props.onFacebook} className="auth-social-facebook">
          <FacebookFilled /> Facebook
        </Button>
      </div>
    </Space>
  );
}

function SignUpForm(props: SignUpFormProps) {
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <div className="auth-headline">
        <div className="auth-title">Register</div>
        <Text type="secondary" className="auth-subtitle">
          Create your account in seconds.
        </Text>
      </div>
      <Input
        type="email"
        placeholder="email@example.com"
        prefix={<MailOutlined />}
        value={props.email}
        onChange={(e) => props.onEmailChange(e.target.value)}
        className="auth-input"
      />
      <Input.Password
        placeholder="Password"
        prefix={<LockOutlined />}
        value={props.password}
        onChange={(e) => props.onPasswordChange(e.target.value)}
        className="auth-input"
      />
      <Input.Password
        placeholder="Confirm password"
        prefix={<LockOutlined />}
        value={props.confirmPassword}
        onChange={(e) => props.onConfirmPasswordChange(e.target.value)}
        className="auth-input"
      />
      <Button type="primary" onClick={props.onSubmit} loading={props.loading} block>
        Register
      </Button>
      <div className="auth-divider">
        <span>Or</span>
      </div>
      <div className="auth-social-grid">
        <Button
          onClick={props.onGoogle}
          loading={props.loading}
          className="auth-social-google"
        >
          <GoogleOutlined /> Google
        </Button>
        <Button onClick={props.onFacebook} className="auth-social-facebook">
          <FacebookFilled /> Facebook
        </Button>
      </div>
    </Space>
  );
}

export function AuthSlideForms(props: AuthSlideFormsProps) {
  return (
    <div className="auth-slide-root">
      <div className="auth-mode-switch">
        <Button
          type={props.mode === 'signin' ? 'primary' : 'default'}
          onClick={() => props.onModeChange('signin')}
          size="small"
        >
          Log in
        </Button>
        <Button
          type={props.mode === 'signup' ? 'primary' : 'default'}
          onClick={() => props.onModeChange('signup')}
          size="small"
        >
          Sign up
        </Button>
      </div>

      <div className="auth-slider-window">
        <div
          className={`auth-slider-track ${
            props.mode === 'signup' ? 'auth-slider-track-signup' : ''
          }`}
        >
          <div className="auth-slide-pane">
            <LoginForm {...props.login} />
          </div>
          <div className="auth-slide-pane">
            <SignUpForm {...props.signup} />
          </div>
        </div>
      </div>
    </div>
  );
}
