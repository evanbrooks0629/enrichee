export interface Profile {
    email: string;
    [key: string]: any;
}

export interface ProfileWithDraftId extends Profile {
    gmailDraftId: string;
}