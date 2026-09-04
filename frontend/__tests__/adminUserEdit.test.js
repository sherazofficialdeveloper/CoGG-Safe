import {userEditFormValues} from '../src/utils/adminUserForm';

describe('admin user edit routing data', () => {
  it('populates the edit form from a user card model', () => {
    expect(userEditFormValues({
      username: 'alice',
      mobileNumber: '+15551234567',
      email: 'alice@example.com',
    })).toEqual({
      username: 'alice',
      mobileNumber: '+15551234567',
      email: 'alice@example.com',
    });
  });

  it('does not submit the display-only missing email placeholder', () => {
    expect(userEditFormValues({name: 'alice', phone: '123', email: 'No email configured'}))
      .toEqual({username: 'alice', mobileNumber: '123', email: ''});
  });
});
