/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $AuthVerifyResponse = {
    properties: {
        deviceId: {
            type: 'string',
            description: `Device identifier associated with the token`,
        },
        valid: {
            type: 'boolean',
            description: `Whether the token is accepted by the backend`,
            isRequired: true,
        },
    },
} as const;
