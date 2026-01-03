/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $PairingStatusResponse = {
    properties: {
        configured: {
            type: 'boolean',
            isRequired: true,
        },
        pendingCodes: {
            type: 'number',
            isRequired: true,
            format: 'int32',
        },
    },
} as const;
