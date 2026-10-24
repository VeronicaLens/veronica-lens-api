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

const profileErrors = {
  '401': errorResponse('Missing, invalid or expired token'),
  '404': errorResponse('Profile not found'),
  '500': errorResponse('Unexpected server error'),
  '502': errorResponse('Invalid provider response'),
  '503': errorResponse('Profile or authentication service unavailable'),
};

export const openApiDocument = {
  openapi: '3.0.3',

  info: {
    title: 'Veronica Lens API',
    version: '1.0.0',
    description:
      'Veronica Lens API. Never share credentials or tokens entered in this interface.',
  },

  servers: [{ url: '/' }],

  tags: [
    { name: 'Health' },
    { name: 'Authentication' },
    { name: 'Profile' },
    { name: 'Account' },
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

    '/api/v1/auth/google': {
      post: {
        tags: ['Authentication'],
        operationId: 'signInWithGoogle',
        summary: 'Sign in with a Google ID token',
        description:
          'Send the ID token obtained by Google Sign-In on the device. If the token was requested with a nonce, send the raw nonce. A new account is created on the first sign-in.',
        requestBody: requestBody('GoogleSignInInput'),
        responses: {
          '200': dataResponse('Authenticated session', 'PublicSession'),
          ...commonAuthErrors,
          '401': errorResponse('Invalid or expired Google credential'),
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

    '/api/v1/auth/sign-out': {
      post: {
        tags: ['Authentication'],
        operationId: 'signOut',
        summary: 'Sign out from the current session',
        description:
          'Revokes refresh tokens for the current session only. Other sessions are not affected. Issued access tokens can remain valid until expiration. The application must also clear its local session.',
        security: [{ bearerAuth: [] }],
        responses: {
          '204': {
            description: 'Current session signed out; no response body',
          },
          '401': errorResponse('Missing, invalid or expired token'),
          '500': errorResponse('Unexpected server error'),
          '502': errorResponse('Unexpected authentication provider response'),
          '503': errorResponse('Authentication provider unavailable'),
        },
      },
    },

    '/api/v1/auth/password/recovery': {
      post: {
        tags: ['Authentication'],
        operationId: 'requestPasswordRecovery',
        summary: 'Request password recovery instructions',
        description:
          'Returns a generic acknowledgement without confirming account existence. The redirect is configured by the server. This operation does not update the password.',
        requestBody: requestBody('PasswordRecoveryInput'),
        responses: {
          '202': {
            description: 'Recovery request accepted',
            content: jsonContent({
              type: 'object',
              required: ['data'],
              properties: {
                data: {
                  type: 'object',
                  required: ['message'],
                  properties: {
                    message: {
                      type: 'string',
                      enum: [
                        'If the account exists, password recovery instructions were sent.',
                      ],
                    },
                  },
                },
              },
            }),
          },
          ...commonAuthErrors,
          '413': errorResponse('Request body exceeds 1 MB'),
        },
      },
    },

    '/api/v1/auth/password': {
      put: {
        tags: ['Authentication'],
        operationId: 'updatePassword',
        summary: 'Update the password of the authenticated user',
        description:
          'Uses the session of the authenticated user; send the refresh token of the same session. Sessions expiring within 2 minutes are refused with AUTH_SESSION_REFRESH_REQUIRED: refresh the session and retry. Supabase password rules and reauthentication settings apply.',
        security: [{ bearerAuth: [] }],
        requestBody: requestBody('UpdatePasswordInput'),
        responses: {
          '200': dataResponse('Password updated', 'CurrentUserResult'),
          '400': errorResponse('Invalid input or rejected password'),
          '401': errorResponse(
            'Missing, invalid or expiring session; refresh may be required',
          ),
          '403': errorResponse('Recent reauthentication required'),
          '413': errorResponse('Request body exceeds 1 MB'),
          '429': commonAuthErrors['429'],
          '500': errorResponse('Unexpected server error'),
          '502': errorResponse('Invalid or unexpected provider response'),
          '503': errorResponse('Authentication provider unavailable'),
        },
      },
    },

    '/api/v1/profile': {
      get: {
        tags: ['Profile'],
        operationId: 'getProfile',
        summary: 'Get the authenticated user profile',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': dataResponse('Profile of the authenticated user', 'ProfileResult'),
          ...profileErrors,
        },
      },
      patch: {
        tags: ['Profile'],
        operationId: 'updateProfile',
        summary: 'Update the authenticated user profile',
        description:
        'Send only the fields to change. Latitude and longitude must be sent together, both numbers or both null. Use the avatar endpoints to change the avatar.',
        security: [{ bearerAuth: [] }],
        requestBody: requestBody('UpdateProfileInput'),
        responses: {
          '200': dataResponse('Updated profile', 'ProfileResult'),
          '400': errorResponse('Invalid input or rejected values'),
          '413': errorResponse('Request body exceeds 1 MB'),
          ...profileErrors,
        },
      },
    },

    '/api/v1/profile/avatar': {
      put: {
        tags: ['Profile'],
        operationId: 'uploadAvatar',
        summary: 'Upload or replace the avatar image',
        description:
          'Send the raw image bytes with the matching Content-Type (JPEG, PNG or WebP, up to 5 MB). The content is checked against the declared type. The stored URL changes on every upload.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: Object.fromEntries(
            ['image/jpeg', 'image/png', 'image/webp'].map((type) => [
              type,
              { schema: { type: 'string', format: 'binary' } },
            ]),
          ),
        },
        responses: {
          '200': dataResponse('Profile with the new avatar', 'ProfileResult'),
          '400': errorResponse('Empty file or content does not match the type'),
          '413': errorResponse('Avatar exceeds 5 MB'),
          '415': errorResponse('Unsupported image type'),
          ...profileErrors,
          '503': errorResponse('Profile, storage or authentication service unavailable'),
        },
      },
      delete: {
        tags: ['Profile'],
        operationId: 'removeAvatar',
        summary: 'Remove the avatar image',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': dataResponse('Profile without avatar', 'ProfileResult'),
          ...profileErrors,
          '503': errorResponse('Profile, storage or authentication service unavailable'),
        },
      },
    },

    '/api/v1/account': {
      delete: {
        tags: ['Account'],
        operationId: 'deleteAccount',
        summary: 'Permanently delete the authenticated account',
        description:
          'Irreversible. Removes observation media and avatar files, then the user; database rows are removed by cascade. Send {"confirmation": "DELETE"}. Issued access tokens remain valid until they expire; the app must clear its local session.',
        security: [{ bearerAuth: [] }],
        requestBody: requestBody('DeleteAccountInput'),
        responses: {
          '204': { description: 'Account deleted; no response body' },
          '400': errorResponse('Missing or invalid confirmation'),
          '401': errorResponse('Missing, invalid or expired token'),
          '500': errorResponse('Unexpected server error'),
          '503': errorResponse('Account could not be deleted; try again later'),
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

      GoogleSignInInput: {
        type: 'object',
        required: ['idToken'],
        properties: {
          idToken: {
            type: 'string',
            maxLength: 8192,
            pattern: '^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$',
          },
          nonce: { type: 'string', minLength: 1, maxLength: 256 },
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

      PasswordRecoveryInput: {
        type: 'object',
        required: ['email'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            maxLength: 254,
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

      UpdatePasswordInput: {
        type: 'object',
        required: ['password', 'refreshToken'],
        properties: {
          password: {
            type: 'string',
            format: 'password',
            minLength: 8,
            maxLength: 72,
          },
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

      Profile: {
        type: 'object',
        required: [
          'id',
          'displayName',
          'avatarUrl',
          'locationName',
          'latitude',
          'longitude',
          'notificationsEnabled',
          'measurementUnit',
          'language',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          displayName: { type: 'string', nullable: true },
          avatarUrl: { type: 'string', format: 'uri', nullable: true },
          locationName: { type: 'string', nullable: true },
          latitude: { type: 'number', nullable: true },
          longitude: { type: 'number', nullable: true },
          notificationsEnabled: { type: 'boolean' },
          measurementUnit: { type: 'string', enum: ['metric', 'imperial'] },
          language: { type: 'string', enum: ['pt-BR', 'en'] },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },

      ProfileResult: {
        type: 'object',
        required: ['profile'],
        properties: {
          profile: ref('Profile'),
        },
      },

      DeleteAccountInput: {
        type: 'object',
        required: ['confirmation'],
        additionalProperties: false,
        properties: {
          confirmation: { type: 'string', enum: ['DELETE'] },
        },
      },

      UpdateProfileInput: {
        type: 'object',
        additionalProperties: false,
        minProperties: 1,
        properties: {
          displayName: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            nullable: true,
          },
          locationName: {
            type: 'string',
            minLength: 1,
            maxLength: 120,
            nullable: true,
          },
          latitude: {
            type: 'number',
            minimum: -90,
            maximum: 90,
            nullable: true,
          },
          longitude: {
            type: 'number',
            minimum: -180,
            maximum: 180,
            nullable: true,
          },
          notificationsEnabled: { type: 'boolean' },
          measurementUnit: { type: 'string', enum: ['metric', 'imperial'] },
          language: { type: 'string', enum: ['pt-BR', 'en'] },
        },
      },
    },
  },
};