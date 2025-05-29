export interface Profile {
    email: string;
    [key: string]: string | undefined;
}

export interface ProfileWithDraftId extends Profile {
    gmailDraftId: string;
}