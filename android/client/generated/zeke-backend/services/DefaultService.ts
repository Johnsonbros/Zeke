/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AuthVerifyResponse } from '../models/AuthVerifyResponse';
import type { DashboardSummary } from '../models/DashboardSummary';
import type { PairDeviceRequest } from '../models/PairDeviceRequest';
import type { PairDeviceResponse } from '../models/PairDeviceResponse';
import type { PairingStatusResponse } from '../models/PairingStatusResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class DefaultService {
    /**
     * Verify an existing device token with the ZEKE backend
     * @param xZekeDeviceToken
     * @returns AuthVerifyResponse Verification status for the provided device token
     * @throws ApiError
     */
    public static verifyDeviceToken(
        xZekeDeviceToken: string,
    ): CancelablePromise<AuthVerifyResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/zeke/auth/verify',
            headers: {
                'X-ZEKE-Device-Token': xZekeDeviceToken,
            },
            errors: {
                401: `Token is invalid or expired`,
            },
        });
    }
    /**
     * Pair a new device with the ZEKE backend
     * @param requestBody
     * @returns PairDeviceResponse Device paired successfully
     * @throws ApiError
     */
    public static pairDevice(
        requestBody: PairDeviceRequest,
    ): CancelablePromise<PairDeviceResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/zeke/auth/pair',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Pairing failed due to invalid code or request`,
            },
        });
    }
    /**
     * Check if SMS pairing is configured on the backend
     * @returns PairingStatusResponse Pairing configuration and pending code status
     * @throws ApiError
     */
    public static getPairingStatus(): CancelablePromise<PairingStatusResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/zeke/auth/pairing-status',
        });
    }
    /**
     * Fetch dashboard rollups for the current user
     * @returns DashboardSummary Counts used by the client home screen
     * @throws ApiError
     */
    public static getDashboardSummary(): CancelablePromise<DashboardSummary> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/zeke/dashboard',
        });
    }
}
