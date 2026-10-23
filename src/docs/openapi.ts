const ref = (name: string) => ({
  $ref: `#/components/schemas/${name}`,
});

const jsonContent = (schema: object) => ({
  'application/json': { schema },
});

const requestBody = (schemaName: string) => ({
  required: true,
  content: jsonContent(ref(schemaName)),
});

const dataResponse = (description: string, schemaName: string) => ({
  description,
  content: jsonContent({
    type: 'object',
    required: ['data'],
    properties: {
      data: ref(schemaName),
    },
  }),
});

const errorResponse = (description: string) => ({
  description,
  content: jsonContent(ref('Error')),
});

const commonAuthErrors = {
  '400': errorResponse('Invalid input or rejected request'),
  '429': {
    ...errorResponse('Too many authentication attempts'),
    headers: {
      'Retry-After': {
        description: 'Seconds to wait before retrying',
        schema: { type: 'integer', minimum: 1 },
      },
    },
  },
  '500': errorResponse('Unexpected server error'),
  '502': errorResponse('Invalid or unexpected provider response'),
  '503': errorResponse('Authentication provider unavailable'),
};

export const openApiDocument = {
  openapi: '3.0.3',

  info: {
    title: 'Veronica Lens API',
    version: '1.0.0',
    description:
      'Authentication API. Never share credentials or tokens entered in this interface.',
  },

  servers: [{ url: '/' }],

  tags: [
    { name: 'Health' },
    { name: 'Authentication' },
  ],

  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        operationId: 'getHealth',
        summary: 'Check whether the API process is running',
        description: 'Does not verify Supabase connectivity.',
        responses: {
          '200': {
            description: 'API is running',
            content: jsonContent(ref('Health')),
          },
        },
      },
    },

    '/api/v1/auth/sign-up': {
      post: {
        tags: ['Authentication'],
        operationId: 'signUp',
        summary: 'Request account registration',
        description:
          'A response does not prove that the email was previously unregistered.',
        requestBody: requestBody('SignUpInput'),
        responses: {
          '201': dataResponse(
            'Registration returned an immediate session',
            'SignUpResult',
          ),
          '202': dataResponse(
            'Request accepted; email confirmation required',
            'SignUpResult',
          ),
          ...commonAuthErrors,
          '413': errorResponse('Request body exceeds 1 MB'),
        },
      },
    },

    '/api/v1/auth/sign-in': {
      post: {
        tags: ['Authentication'],
        operationId: 'signIn',
        summary: 'Sign in with email and password',
        requestBody: requestBody('SignInInput'),
        responses: {
          '200': dataResponse('Authenticated session', 'PublicSession'),
          ...commonAuthErrors,
          '401': errorResponse('Invalid authentication credentials'),
          '403': errorResponse('Email confirmation required'),
          '413': errorResponse('Request body exceeds 1 MB'),
        },
      },
    },

    '/api/v1/auth/refresh': {
      post: {
        tags: ['Authentication'],
        operationId: 'refreshSession',
        summary: 'Refresh the authentication session',
        description:
          'Replace both stored tokens with the returned values. Avoid concurrent refresh requests for the same session.',
        requestBody: requestBody('RefreshSessionInput'),
        responses: {
          '200': dataResponse('Updated session', 'PublicSession'),
          ...commonAuthErrors,
          '401': errorResponse('Invalid or expired session'),
          '413': errorResponse('Request body exceeds 1 MB'),
        },
      },
    },

    '/api/v1/auth/me': {
      get: {
        tags: ['Authentication'],
        operationId: 'getAuthenticatedUser',
        summary: 'Get the authenticated user',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': dataResponse('Authenticated user', 'CurrentUserResult'),
          '401': errorResponse('Missing, invalid or expired token'),
          '500': errorResponse('Unexpected server error'),
          '502': errorResponse('Invalid or unexpected provider response'),
          '503': errorResponse('Authentication provider unavailable'),
        },
      },
    },
  },

  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },

    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },

      Health: {
        type: 'object',
        required: ['status', 'uptime', 'timestamp'],
        properties: {
          status: { type: 'string', enum: ['ok'] },
          uptime: { type: 'number', minimum: 0 },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },

      SignUpInput: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            maxLength: 254,
          },
          password: {
            type: 'string',
            format: 'password',
            minLength: 8,
            maxLength: 72,
          },
          displayName: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
          },
        },
      },

      SignInInput: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            maxLength: 254,
          },
          password: {
            type: 'string',
            format: 'password',
            minLength: 1,
            maxLength: 72,
          },
        },
      },

      RefreshSessionInput: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: {
            type: 'string',
            minLength: 1,
            pattern: '\\S',
          },
        },
      },

      PublicUser: {
        type: 'object',
        required: ['id', 'email', 'displayName'],
        properties: {
          id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          displayName: { type: 'string', nullable: true },
        },
      },

      PublicSession: {
        type: 'object',
        required: [
          'user',
          'accessToken',
          'refreshToken',
          'tokenType',
          'expiresAt',
        ],
        properties: {
          user: ref('PublicUser'),
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
          tokenType: { type: 'string', enum: ['bearer'] },
          expiresAt: { type: 'string', format: 'date-time' },
        },
      },

      SignUpResult: {
        type: 'object',
        required: ['user', 'session', 'confirmationRequired'],
        properties: {
          user: ref('PublicUser'),
          session: {
            type: 'object',
            nullable: true,
            allOf: [ref('PublicSession')],
          },
          confirmationRequired: { type: 'boolean' },
        },
      },

      CurrentUserResult: {
        type: 'object',
        required: ['user'],
        properties: {
          user: ref('PublicUser'),
        },
      },
    },
  },
};