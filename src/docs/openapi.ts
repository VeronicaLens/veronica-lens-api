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

const conditionsErrors = {
  '400': errorResponse('Invalid input or observation time out of range'),
  '401': errorResponse('Missing, invalid or expired token'),
  '413': errorResponse('Request body exceeds 1 MB'),
  '500': errorResponse('Unexpected server error'),
  '503': errorResponse('Weather or authentication service unavailable'),
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
    { name: 'Catalog' },
    { name: 'Sky guide' },
    { name: 'Conditions' },
    { name: 'Planning' },
    { name: 'Events' },
    { name: 'Observations' },
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

    '/api/v1/catalog/celestial-objects': {
      get: {
        tags: ['Catalog'],
        operationId: 'searchCelestialObjects',
        summary: 'Search the celestial object catalog',
        description:
          'Search is case- and accent-insensitive and matches id, name or aliases. Objects keep catalog order.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'q',
            in: 'query',
            schema: { type: 'string', minLength: 1, maxLength: 80 },
          },
          {
            name: 'type',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['moon', 'planet', 'star', 'constellation'],
            },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          },
        ],
        responses: {
          '200': {
            description: 'Matching objects',
            content: jsonContent({
              type: 'object',
              required: ['data', 'meta'],
              properties: {
                data: {
                  type: 'object',
                  required: ['objects'],
                  properties: {
                    objects: { type: 'array', items: ref('CelestialObject') },
                  },
                },
                meta: {
                  type: 'object',
                  required: ['count'],
                  properties: { count: { type: 'integer', minimum: 0 } },
                },
              },
            }),
          },
          '400': errorResponse('Invalid query parameters'),
          '401': errorResponse('Missing, invalid or expired token'),
          '500': errorResponse('Unexpected server error'),
          '503': errorResponse('Authentication provider unavailable'),
        },
      },
    },

    '/api/v1/catalog/celestial-objects/{id}': {
      get: {
        tags: ['Catalog'],
        operationId: 'getCelestialObject',
        summary: 'Get a celestial object by id',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
          },
        ],
        responses: {
          '200': {
            description: 'Celestial object',
            content: jsonContent({
              type: 'object',
              required: ['data'],
              properties: {
                data: {
                  type: 'object',
                  required: ['object'],
                  properties: { object: ref('CelestialObject') },
                },
              },
            }),
          },
          '401': errorResponse('Missing, invalid or expired token'),
          '404': errorResponse('Celestial object not found'),
          '500': errorResponse('Unexpected server error'),
          '503': errorResponse('Authentication provider unavailable'),
        },
      },
    },

    '/api/v1/sky-guide/positions': {
      post: {
        tags: ['Sky guide'],
        operationId: 'getSkyPositions',
        summary: 'Locate catalog objects in the sky for an observer',
        description:
          'Stars and constellations are computed locally from J2000 coordinates; the Moon and planets come from JPL Horizons. Unknown ids and provider failures are listed in `unavailable` instead of failing the request. The location is sent in the body so it does not appear in URLs or access logs.',
        security: [{ bearerAuth: [] }],
        requestBody: requestBody('SkyPositionsInput'),
        responses: {
          '200': dataResponse('Positions and unavailable objects', 'SkyPositionsResult'),
          '400': errorResponse('Invalid input or observation time out of range'),
          '401': errorResponse('Missing, invalid or expired token'),
          '413': errorResponse('Request body exceeds 1 MB'),
          '500': errorResponse('Unexpected server error'),
          '503': errorResponse('Authentication provider unavailable'),
        },
      },
    },

    '/api/v1/sky-guide/rise-set': {
      post: {
        tags: ['Sky guide'],
        operationId: 'getRiseTransitSet',
        summary: 'Rise, transit and set times for the next 24 hours',
        description:
          'Window of 24 hours from `from` (default now). Stars and constellations are computed analytically with standard refraction; the Moon and planets come from JPL Horizons at one-minute resolution. `horizon` tells whether the object crosses the horizon or stays above or below it. Unknown ids and provider failures are listed in `unavailable`.',
        security: [{ bearerAuth: [] }],
        requestBody: requestBody('RiseSetInput'),
        responses: {
          '200': dataResponse('Events per object', 'RiseSetResult'),
          '400': errorResponse('Invalid input or window out of range'),
          '401': errorResponse('Missing, invalid or expired token'),
          '413': errorResponse('Request body exceeds 1 MB'),
          '500': errorResponse('Unexpected server error'),
          '503': errorResponse('Authentication provider unavailable'),
        },
      },
    },

    '/api/v1/conditions/current': {
      post: {
        tags: ['Conditions'],
        operationId: 'getCurrentConditions',
        summary: 'Assess observing conditions for one instant',
        description:
          'Weather from the closest forecast hour (Open-Meteo) and the Sun altitude at the exact instant. `at` defaults to now and accepts up to one hour in the past and seven days ahead. Factors and rating are codes; the app renders the text.',
        security: [{ bearerAuth: [] }],
        requestBody: requestBody('CurrentConditionsInput'),
        responses: {
          '200': dataResponse('Conditions for the closest hour', 'CurrentConditionsResult'),
          ...conditionsErrors,
        },
      },
    },

    '/api/v1/conditions/forecast': {
      post: {
        tags: ['Conditions'],
        operationId: 'getConditionsForecast',
        summary: 'Assess observing conditions for the next seven days',
        description: 'Returns 168 hourly assessments starting at the next full hour (UTC).',
        security: [{ bearerAuth: [] }],
        requestBody: requestBody('ConditionsForecastInput'),
        responses: {
          '200': dataResponse('Hourly conditions', 'ConditionsForecastResult'),
          ...conditionsErrors,
        },
      },
    },

    '/api/v1/planning/recommendation': {
      post: {
        tags: ['Planning'],
        operationId: 'recommendObservationWindow',
        summary: 'Find the best window to observe one object',
        description:
          'Samples the window every 15 minutes. A sample is favorable when the object is at or above `minimumAltitudeDegrees` and the conditions are not poor (darkness only when no weather forecast covers it). The recommended window is the longest favorable stretch. Windows last up to 24 hours, start at most one hour ago and end within one year.',
        security: [{ bearerAuth: [] }],
        requestBody: requestBody('RecommendationInput'),
        responses: {
          '200': dataResponse('Recommendation and samples', 'RecommendationResult'),
          '400': errorResponse('Invalid input or window out of range'),
          '401': errorResponse('Missing, invalid or expired token'),
          '404': errorResponse('Celestial object not found'),
          '413': errorResponse('Request body exceeds 1 MB'),
          '500': errorResponse('Unexpected server error'),
          '503': errorResponse('Object positions or authentication service unavailable'),
        },
      },
    },

    '/api/v1/events': {
      get: {
        tags: ['Events'],
        operationId: 'listEvents',
        summary: 'List curated astronomical events',
        description:
          'Published events curated in the database (eclipses, meteor showers, conjunctions). Returns events overlapping the range, including ongoing ones. `from` defaults to now and `to` to 90 days later; the range spans at most one year.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          {
            name: 'type',
            in: 'query',
            schema: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 80 },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        ],
        responses: {
          '200': {
            description: 'Events ordered by start time',
            content: jsonContent({
              type: 'object',
              required: ['data', 'meta'],
              properties: {
                data: {
                  type: 'object',
                  required: ['from', 'to', 'events'],
                  properties: {
                    from: { type: 'string', format: 'date-time' },
                    to: { type: 'string', format: 'date-time' },
                    events: { type: 'array', items: ref('AstronomicalEvent') },
                  },
                },
                meta: {
                  type: 'object',
                  required: ['count'],
                  properties: { count: { type: 'integer', minimum: 0 } },
                },
              },
            }),
          },
          '400': errorResponse('Invalid query parameters or range'),
          '401': errorResponse('Missing, invalid or expired token'),
          '500': errorResponse('Unexpected server error'),
          '503': errorResponse('Events or authentication service unavailable'),
        },
      },
    },

    '/api/v1/events/{id}': {
      get: {
        tags: ['Events'],
        operationId: 'getEvent',
        summary: 'Get a curated astronomical event',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Event',
            content: jsonContent({
              type: 'object',
              required: ['data'],
              properties: {
                data: {
                  type: 'object',
                  required: ['event'],
                  properties: { event: ref('AstronomicalEvent') },
                },
              },
            }),
          },
          '401': errorResponse('Missing, invalid or expired token'),
          '404': errorResponse('Event not found or not published'),
          '500': errorResponse('Unexpected server error'),
          '503': errorResponse('Events or authentication service unavailable'),
        },
      },
    },

    '/api/v1/observations': {
      get: {
        tags: ['Observations'],
        operationId: 'listObservations',
        summary: 'List the authenticated user’s observations',
        description:
          'Newest first. Each observation includes signed URLs for its photos, valid for one hour. `hasMore` is true when another page exists.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          },
        ],
        responses: {
          '200': {
            description: 'Observation page',
            content: jsonContent({
              type: 'object',
              required: ['data'],
              properties: {
                data: {
                  type: 'object',
                  required: ['observations', 'page', 'pageSize', 'hasMore'],
                  properties: {
                    observations: { type: 'array', items: { type: 'object' } },
                    page: { type: 'integer' },
                    pageSize: { type: 'integer' },
                    hasMore: { type: 'boolean' },
                  },
                },
              },
            }),
          },
          '400': errorResponse('Invalid page or pageSize'),
          '401': errorResponse('Missing, invalid or expired token'),
          '500': errorResponse('Unexpected server error'),
          '503': errorResponse('Observations or authentication service unavailable'),
        },
      },
    },

    '/api/v1/observations/{observationId}': {
      delete: {
        tags: ['Observations'],
        operationId: 'deleteObservation',
        summary: 'Delete an observation and all of its photos',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'observationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '204': { description: 'Observation deleted; no response body' },
          '400': errorResponse('Invalid observation id'),
          '401': errorResponse('Missing, invalid or expired token'),
          '404': errorResponse('Observation not found'),
          '500': errorResponse('Unexpected server error'),
          '503': errorResponse('Observation storage or database unavailable'),
        },
      },
    },

    '/api/v1/observations/{observationId}/photos/{photoId}': {
      put: {
        tags: ['Observations'],
        operationId: 'saveObservationPhoto',
        summary: 'Create or replace a photo of an observation',
        description:
          'Send the raw image bytes with the matching Content-Type (JPEG, PNG, WebP, HEIC or HEIF, up to 50 MB). The bytes are checked against the declared type. The capture metadata travels in the `x-veronica-observation` header as URL-encoded JSON, so the body stays binary.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'observationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'photoId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          {
            name: 'x-veronica-observation',
            in: 'header',
            required: true,
            description:
              'URL-encoded JSON with title, notes, capturedAt, optional astronomicalEventId, celestialObjectName, latitude, longitude, device and parameters.',
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: Object.fromEntries(
            ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].map((type) => [
              type,
              { schema: { type: 'string', format: 'binary' } },
            ]),
          ),
        },
        responses: {
          '200': {
            description: 'Saved photo',
            content: jsonContent({
              type: 'object',
              required: ['data'],
              properties: {
                data: {
                  type: 'object',
                  required: ['photo'],
                  properties: {
                    photo: {
                      type: 'object',
                      properties: {
                        observationId: { type: 'string', format: 'uuid' },
                        photoId: { type: 'string', format: 'uuid' },
                        storagePath: { type: 'string' },
                        capturedAt: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            }),
          },
          '400': errorResponse('Empty file, content does not match the type, or invalid metadata header'),
          '401': errorResponse('Missing, invalid or expired token'),
          '413': errorResponse('Photo exceeds 50 MB'),
          '415': errorResponse('Unsupported image type'),
          '500': errorResponse('Unexpected server error'),
          '503': errorResponse('Observation storage or database unavailable'),
        },
      },
      delete: {
        tags: ['Observations'],
        operationId: 'deleteObservationPhoto',
        summary: 'Delete one photo of an observation',
        description:
          'Removes the file first. If the observation has no photos left, the observation is deleted too, and `observationDeleted` is true.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'observationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'photoId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Photo deleted',
            content: jsonContent({
              type: 'object',
              required: ['data'],
              properties: {
                data: {
                  type: 'object',
                  required: ['observationDeleted'],
                  properties: { observationDeleted: { type: 'boolean' } },
                },
              },
            }),
          },
          '400': errorResponse('Invalid observation or photo id'),
          '401': errorResponse('Missing, invalid or expired token'),
          '404': errorResponse('Photo not found'),
          '500': errorResponse('Unexpected server error'),
          '503': errorResponse('Observation storage or database unavailable'),
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

      CelestialObject: {
        type: 'object',
        required: ['id', 'name', 'type', 'aliases', 'magnitude', 'coordinates'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          type: {
            type: 'string',
            enum: ['moon', 'planet', 'star', 'constellation'],
          },
          aliases: { type: 'array', items: { type: 'string' } },
          magnitude: {
            type: 'number',
            nullable: true,
            description: 'Apparent magnitude; null for moving or extended objects.',
          },
          coordinates: {
            oneOf: [ref('FixedCoordinates'), ref('EphemerisCoordinates')],
            discriminator: { propertyName: 'kind' },
          },
        },
      },

      FixedCoordinates: {
        type: 'object',
        required: ['kind', 'epoch', 'rightAscensionDegrees', 'declinationDegrees'],
        properties: {
          kind: { type: 'string', enum: ['fixed'] },
          epoch: { type: 'string', enum: ['J2000'] },
          rightAscensionDegrees: { type: 'number', minimum: 0, maximum: 360 },
          declinationDegrees: { type: 'number', minimum: -90, maximum: 90 },
        },
      },

      EphemerisCoordinates: {
        type: 'object',
        required: ['kind', 'provider', 'providerObjectId'],
        properties: {
          kind: { type: 'string', enum: ['ephemeris'] },
          provider: { type: 'string', enum: ['jpl-horizons'] },
          providerObjectId: { type: 'string' },
        },
      },

      SkyPositionsInput: {
        type: 'object',
        required: ['objectIds', 'observer'],
        additionalProperties: false,
        properties: {
          objectIds: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            items: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
            description: 'Catalog ids; duplicates are ignored.',
          },
          observedAt: {
            type: 'string',
            format: 'date-time',
            description: 'ISO 8601 with offset, within one year from now. Defaults to now.',
          },
          observer: {
            type: 'object',
            required: ['latitudeDegrees', 'longitudeDegrees'],
            additionalProperties: false,
            properties: {
              latitudeDegrees: { type: 'number', minimum: -90, maximum: 90 },
              longitudeDegrees: { type: 'number', minimum: -180, maximum: 180 },
              elevationMeters: {
                type: 'number',
                minimum: -500,
                maximum: 9000,
                default: 0,
              },
            },
          },
        },
      },

      SkyPositionsResult: {
        type: 'object',
        required: ['observedAt', 'positions', 'unavailable'],
        properties: {
          observedAt: { type: 'string', format: 'date-time' },
          positions: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'name', 'type', 'magnitude', 'horizontal', 'aboveHorizon'],
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                type: {
                  type: 'string',
                  enum: ['moon', 'planet', 'star', 'constellation'],
                },
                magnitude: { type: 'number', nullable: true },
                horizontal: {
                  type: 'object',
                  required: ['altitudeDegrees', 'azimuthDegrees'],
                  properties: {
                    altitudeDegrees: { type: 'number', minimum: -90, maximum: 90 },
                    azimuthDegrees: {
                      type: 'number',
                      minimum: 0,
                      maximum: 360,
                      description: 'Measured eastward from true north.',
                    },
                  },
                },
                aboveHorizon: { type: 'boolean' },
              },
            },
          },
          unavailable: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'reason'],
              properties: {
                id: { type: 'string' },
                reason: {
                  type: 'string',
                  enum: ['NOT_FOUND', 'PROVIDER_UNAVAILABLE'],
                },
              },
            },
          },
        },
      },

      Observer: {
        type: 'object',
        required: ['latitudeDegrees', 'longitudeDegrees'],
        additionalProperties: false,
        properties: {
          latitudeDegrees: { type: 'number', minimum: -90, maximum: 90 },
          longitudeDegrees: { type: 'number', minimum: -180, maximum: 180 },
          elevationMeters: { type: 'number', minimum: -500, maximum: 9000, default: 0 },
        },
      },

      CurrentConditionsInput: {
        type: 'object',
        required: ['observer'],
        additionalProperties: false,
        properties: {
          observer: ref('Observer'),
          at: {
            type: 'string',
            format: 'date-time',
            description: 'ISO 8601 with offset. Defaults to now.',
          },
        },
      },

      ConditionsForecastInput: {
        type: 'object',
        required: ['observer'],
        additionalProperties: false,
        properties: { observer: ref('Observer') },
      },

      HourlyConditions: {
        type: 'object',
        required: ['forecastAt', 'sunAltitudeDegrees', 'weather', 'rating', 'factors'],
        properties: {
          forecastAt: { type: 'string', format: 'date-time' },
          sunAltitudeDegrees: { type: 'number' },
          weather: {
            type: 'object',
            description: 'Null when the weather model has no value for that hour.',
            properties: Object.fromEntries(
              [
                'temperatureCelsius',
                'relativeHumidityPercent',
                'precipitationProbabilityPercent',
                'precipitationMillimeters',
                'cloudCoverPercent',
                'visibilityMeters',
                'windSpeedKilometersPerHour',
              ].map((name) => [name, { type: 'number', nullable: true }]),
            ),
          },
          rating: { type: 'string', enum: ['good', 'fair', 'poor'] },
          factors: {
            type: 'array',
            items: {
              type: 'object',
              required: ['code', 'status'],
              properties: {
                code: {
                  type: 'string',
                  enum: ['darkness', 'cloud-cover', 'precipitation', 'visibility', 'wind', 'humidity'],
                },
                status: {
                  type: 'string',
                  enum: ['good', 'caution', 'poor', 'unknown'],
                },
              },
            },
          },
        },
      },

      CurrentConditionsResult: {
        type: 'object',
        required: ['requestedAt', 'conditions'],
        properties: {
          requestedAt: { type: 'string', format: 'date-time' },
          conditions: ref('HourlyConditions'),
        },
      },

      ConditionsForecastResult: {
        type: 'object',
        required: ['from', 'to', 'hours'],
        properties: {
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
          hours: { type: 'array', items: ref('HourlyConditions') },
        },
      },

      RecommendationInput: {
        type: 'object',
        required: ['objectId', 'observer', 'windowFrom', 'windowTo'],
        additionalProperties: false,
        properties: {
          objectId: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
          observer: ref('Observer'),
          windowFrom: { type: 'string', format: 'date-time' },
          windowTo: {
            type: 'string',
            format: 'date-time',
            description: 'After windowFrom and at most 24 hours later.',
          },
          minimumAltitudeDegrees: {
            type: 'number',
            minimum: 0,
            maximum: 80,
            default: 20,
          },
        },
      },

      RecommendationResult: {
        type: 'object',
        required: [
          'objectId',
          'objectName',
          'status',
          'window',
          'weatherAvailable',
          'minimumAltitudeDegrees',
          'sampleIntervalMinutes',
          'rejections',
          'samples',
        ],
        properties: {
          objectId: { type: 'string' },
          objectName: { type: 'string' },
          status: { type: 'string', enum: ['recommended', 'no_favorable_window'] },
          window: {
            type: 'object',
            nullable: true,
            required: ['from', 'to', 'peakAt', 'peakAltitudeDegrees'],
            properties: {
              from: { type: 'string', format: 'date-time' },
              to: { type: 'string', format: 'date-time' },
              peakAt: { type: 'string', format: 'date-time' },
              peakAltitudeDegrees: { type: 'number' },
            },
          },
          weatherAvailable: { type: 'boolean' },
          minimumAltitudeDegrees: { type: 'number' },
          sampleIntervalMinutes: { type: 'integer' },
          rejections: {
            type: 'object',
            description: 'Samples failing each criterion; one sample may fail both.',
            required: ['belowMinimumAltitude', 'poorConditions'],
            properties: {
              belowMinimumAltitude: { type: 'integer', minimum: 0 },
              poorConditions: { type: 'integer', minimum: 0 },
            },
          },
          samples: {
            type: 'array',
            items: {
              type: 'object',
              required: ['at', 'altitudeDegrees', 'sunAltitudeDegrees', 'rating', 'favorable'],
              properties: {
                at: { type: 'string', format: 'date-time' },
                altitudeDegrees: { type: 'number' },
                sunAltitudeDegrees: { type: 'number' },
                rating: {
                  type: 'string',
                  enum: ['good', 'fair', 'poor'],
                  nullable: true,
                },
                favorable: { type: 'boolean' },
              },
            },
          },
        },
      },

      AstronomicalEvent: {
        type: 'object',
        required: [
          'id',
          'slug',
          'title',
          'description',
          'type',
          'celestialObjectName',
          'startsAt',
          'endsAt',
          'peaksAt',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          slug: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          type: { type: 'string', description: 'Curated category, e.g. eclipse or meteor-shower.' },
          celestialObjectName: { type: 'string', nullable: true },
          startsAt: { type: 'string', format: 'date-time' },
          endsAt: { type: 'string', format: 'date-time', nullable: true },
          peaksAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },

      RiseSetInput: {
        type: 'object',
        required: ['objectIds', 'observer'],
        additionalProperties: false,
        properties: {
          objectIds: {
            type: 'array',
            minItems: 1,
            maxItems: 10,
            items: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
          },
          from: {
            type: 'string',
            format: 'date-time',
            description: 'Start of the 24-hour window, within one year from now. Defaults to now.',
          },
          observer: ref('Observer'),
        },
      },

      RiseSetResult: {
        type: 'object',
        required: ['from', 'to', 'objects', 'unavailable'],
        properties: {
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
          objects: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'name', 'type', 'horizon', 'events'],
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                type: { type: 'string', enum: ['moon', 'planet', 'star', 'constellation'] },
                horizon: {
                  type: 'string',
                  enum: ['rises-and-sets', 'always-above', 'always-below'],
                  nullable: true,
                },
                events: {
                  type: 'array',
                  description: 'Ordered by time; a window may contain two transits.',
                  items: {
                    type: 'object',
                    required: ['type', 'at', 'azimuthDegrees', 'altitudeDegrees'],
                    properties: {
                      type: { type: 'string', enum: ['rise', 'transit', 'set'] },
                      at: { type: 'string', format: 'date-time' },
                      azimuthDegrees: { type: 'number' },
                      altitudeDegrees: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
          unavailable: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'reason'],
              properties: {
                id: { type: 'string' },
                reason: { type: 'string', enum: ['NOT_FOUND', 'PROVIDER_UNAVAILABLE'] },
              },
            },
          },
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